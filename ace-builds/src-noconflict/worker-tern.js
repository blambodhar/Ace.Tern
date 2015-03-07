/* Tern web worker, which is used by default
 * This file also contains all files that are needed for the web worker to run (the server can load files on demand, but its messy to have all these files for once peice of ace functionality) *
 *
 * doc_comment.js has a line commented out because its annoying: if (dot > 5) first = first.slice(0, dot + 1);
 *      (this line causes returned comments for functions to be trimmed after first string)
 *
 * Last updated 3/6/2015 (to latest tern, which is not an official release but contains critical memory leak fix)
 * Versions:
 *      Acorn: 0.12.1
 *      Tern:  0.9.1
 */

// declare global: tern, server
/*jshint maxerr:10000 */

var server;

this.onmessage = function(e) {
    //console.log('onmessage');
    var data = e.data;
    switch (data.type) {
    case "init":
        //GHETTO QUICK HACK- get def from name at bottom of this file so it doesnt have to be included in ext-tern.js file
        if (data.defs && data.defs.length > 0) {
            var tmp = [];
            for (var i = 0; i < data.defs.length; i++) {
                tmp.push(getDefFromName(data.defs[i]));
            }
            data.defs = tmp;
        }
        return startServer(data.defs, data.plugins, data.scripts);
    case "add":
        return server.addFile(data.name, data.text);
    case "del":
        return server.delFile(data.name);
    case "req":
        return server.request(data.body, function(err, reqData) {
            postMessage({
                id: data.id,
                body: reqData,
                err: err && String(err)
            });
        });
    case "getFile":
        var c = pending[data.id];
        delete pending[data.id];
        return c(data.err, data.text);
    case "setDefs":
        return setDefs(data.defs);
    case "debug":
        debug(data.body);
        break;
    default:
        throw new Error("Unknown message type: " + data.type);
    }
    //(hack)- do something with debug messages
    function debug(message) {
        var r = '';
        if (message == "files") {
            for (var i = 0; i < server.files.length; i++) {
                if (i > 0) r += '\n';
                r += server.files[i].name;
            }
        }
        else {
            console.log("unknown debug message in tern worker:" + message);
        }
        if (r) {
            console.log('worker server debug - ' + message + '\n\n' + r);
        }
    }
    //Added for ace- sets defs as setting them on load is not ideal due to structure and the defs are stored in the worker file
    function setDefs(defs) {
        console.log('set defs in worker-tern.js does not work yet... it gets the file but setting the servers defs property is not enough to load the defs- this needs to be updated in tern to allow setting defs after load');
        try {
            server.defs = [];
            if (!defs || defs.length == 0) {
                return;
            }
            for (var i = 0; i < defs.length; i++) {
                server.defs.push(getDefFromName(defs[i]));
                console.log(server.defs);
            }

        }
        catch (ex) {
            console.log('error setting tern defs (should be passed array) error: ' + ex);
        }
    }
    //(hack)- gets def from name at the bottom of this file (jquery,ecma5,browser,underscore)
    function getDefFromName(name) {
        return eval('def_' + name);
    }
};

var nextId = 0,
    pending = {};

function getFile(file, c) {
    console.log('getFile');
    postMessage({
        type: "getFile",
        name: file,
        id: ++nextId
    });
    pending[nextId] = c;
}

function startServer(defs, plugins, scripts) {
    console.log('tern: starting server');
    if (scripts) importScripts.apply(null, scripts);

    server = new tern.Server({
        getFile: getFile,
        async: true,
        defs: defs,
        plugins: plugins
    });
}

var console = {
    log: function(v) {
        postMessage({
            type: "debug",
            message: v
        });
    }
};


//#region acorn/acorn.js

// Acorn is a tiny, fast JavaScript parser written in JavaScript.
//
// Acorn was written by Marijn Haverbeke and various contributors and
// released under an MIT license. The Unicode regexps (for identifiers
// and whitespace) were taken from [Esprima](http://esprima.org) by
// Ariya Hidayat.
//
// Git repositories for Acorn are available at
//
//     http://marijnhaverbeke.nl/git/acorn
//     https://github.com/marijnh/acorn.git
//
// Please use the [github bug tracker][ghbt] to report issues.
//
// [ghbt]: https://github.com/marijnh/acorn/issues
//
// This file defines the main parser interface. The library also comes
// with a [error-tolerant parser][dammit] and an
// [abstract syntax tree walker][walk], defined in other files.
//
// [dammit]: acorn_loose.js
// [walk]: util/walk.js

(function(root, mod) {
  if (typeof exports == "object" && typeof module == "object") return mod(exports); // CommonJS
  if (typeof define == "function" && define.amd) return define(["exports"], mod); // AMD
  mod(root.acorn || (root.acorn = {})); // Plain browser env
})(this, function(exports) {
  "use strict";

  exports.version = "0.12.1";

  // The main exported interface (under `self.acorn` when in the
  // browser) is a `parse` function that takes a code string and
  // returns an abstract syntax tree as specified by [Mozilla parser
  // API][api], with the caveat that inline XML is not recognized.
  //
  // [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API

  var options, input, inputLen, sourceFile;

  exports.parse = function(inpt, opts) {
    input = String(inpt); inputLen = input.length;
    setOptions(opts);
    initTokenState();
    var startPos = options.locations ? [tokPos, curPosition()] : tokPos;
    initParserState();
    return parseTopLevel(options.program || startNodeAt(startPos));
  };

  // A second optional argument can be given to further configure
  // the parser process. These options are recognized:

  var defaultOptions = exports.defaultOptions = {
    // `ecmaVersion` indicates the ECMAScript version to parse. Must
    // be either 3, or 5, or 6. This influences support for strict
    // mode, the set of reserved words, support for getters and
    // setters and other features.
    ecmaVersion: 5,
    // Turn on `strictSemicolons` to prevent the parser from doing
    // automatic semicolon insertion.
    strictSemicolons: false,
    // When `allowTrailingCommas` is false, the parser will not allow
    // trailing commas in array and object literals.
    allowTrailingCommas: true,
    // By default, reserved words are not enforced. Enable
    // `forbidReserved` to enforce them. When this option has the
    // value "everywhere", reserved words and keywords can also not be
    // used as property names.
    forbidReserved: false,
    // When enabled, a return at the top level is not considered an
    // error.
    allowReturnOutsideFunction: false,
    // When enabled, import/export statements are not constrained to
    // appearing at the top of the program.
    allowImportExportEverywhere: false,
    // When enabled, hashbang directive in the beginning of file
    // is allowed and treated as a line comment.
    allowHashBang: false,
    // When `locations` is on, `loc` properties holding objects with
    // `start` and `end` properties in `{line, column}` form (with
    // line being 1-based and column 0-based) will be attached to the
    // nodes.
    locations: false,
    // A function can be passed as `onToken` option, which will
    // cause Acorn to call that function with object in the same
    // format as tokenize() returns. Note that you are not
    // allowed to call the parser from the callback—that will
    // corrupt its internal state.
    onToken: null,
    // A function can be passed as `onComment` option, which will
    // cause Acorn to call that function with `(block, text, start,
    // end)` parameters whenever a comment is skipped. `block` is a
    // boolean indicating whether this is a block (`/* */`) comment,
    // `text` is the content of the comment, and `start` and `end` are
    // character offsets that denote the start and end of the comment.
    // When the `locations` option is on, two more parameters are
    // passed, the full `{line, column}` locations of the start and
    // end of the comments. Note that you are not allowed to call the
    // parser from the callback—that will corrupt its internal state.
    onComment: null,
    // Nodes have their start and end characters offsets recorded in
    // `start` and `end` properties (directly on the node, rather than
    // the `loc` object, which holds line/column data. To also add a
    // [semi-standardized][range] `range` property holding a `[start,
    // end]` array with the same numbers, set the `ranges` option to
    // `true`.
    //
    // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
    ranges: false,
    // It is possible to parse multiple files into a single AST by
    // passing the tree produced by parsing the first file as
    // `program` option in subsequent parses. This will add the
    // toplevel forms of the parsed file to the `Program` (top) node
    // of an existing parse tree.
    program: null,
    // When `locations` is on, you can pass this to record the source
    // file in every node's `loc` object.
    sourceFile: null,
    // This value, if given, is stored in every node, whether
    // `locations` is on or off.
    directSourceFile: null,
    // When enabled, parenthesized expressions are represented by
    // (non-standard) ParenthesizedExpression nodes
    preserveParens: false
  };

  // This function tries to parse a single expression at a given
  // offset in a string. Useful for parsing mixed-language formats
  // that embed JavaScript expressions.

  exports.parseExpressionAt = function(inpt, pos, opts) {
    input = String(inpt); inputLen = input.length;
    setOptions(opts);
    initTokenState(pos);
    initParserState();
    return parseExpression();
  };

  var isArray = function (obj) {
    return Object.prototype.toString.call(obj) === "[object Array]";
  };

  function setOptions(opts) {
    options = {};
    for (var opt in defaultOptions)
      options[opt] = opts && has(opts, opt) ? opts[opt] : defaultOptions[opt];
    sourceFile = options.sourceFile || null;
    if (isArray(options.onToken)) {
      var tokens = options.onToken;
      options.onToken = function (token) {
        tokens.push(token);
      };
    }
    if (isArray(options.onComment)) {
      var comments = options.onComment;
      options.onComment = function (block, text, start, end, startLoc, endLoc) {
        var comment = {
          type: block ? 'Block' : 'Line',
          value: text,
          start: start,
          end: end
        };
        if (options.locations) {
          comment.loc = new SourceLocation();
          comment.loc.start = startLoc;
          comment.loc.end = endLoc;
        }
        if (options.ranges)
          comment.range = [start, end];
        comments.push(comment);
      };
    }
    isKeyword = options.ecmaVersion >= 6 ? isEcma6Keyword : isEcma5AndLessKeyword;
  }

  // The `getLineInfo` function is mostly useful when the
  // `locations` option is off (for performance reasons) and you
  // want to find the line/column position for a given character
  // offset. `input` should be the code string that the offset refers
  // into.

  var getLineInfo = exports.getLineInfo = function(input, offset) {
    for (var line = 1, cur = 0;;) {
      lineBreak.lastIndex = cur;
      var match = lineBreak.exec(input);
      if (match && match.index < offset) {
        ++line;
        cur = match.index + match[0].length;
      } else break;
    }
    return {line: line, column: offset - cur};
  };

  function Token() {
    this.type = tokType;
    this.value = tokVal;
    this.start = tokStart;
    this.end = tokEnd;
    if (options.locations) {
      this.loc = new SourceLocation();
      this.loc.end = tokEndLoc;
    }
    if (options.ranges)
      this.range = [tokStart, tokEnd];
  }

  exports.Token = Token;

  // Acorn is organized as a tokenizer and a recursive-descent parser.
  // The `tokenize` export provides an interface to the tokenizer.
  // Because the tokenizer is optimized for being efficiently used by
  // the Acorn parser itself, this interface is somewhat crude and not
  // very modular. Performing another parse or call to `tokenize` will
  // reset the internal state, and invalidate existing tokenizers.

  exports.tokenize = function(inpt, opts) {
    input = String(inpt); inputLen = input.length;
    setOptions(opts);
    initTokenState();
    skipSpace();

    function getToken() {
      lastEnd = tokEnd;
      readToken();
      return new Token();
    }
    getToken.jumpTo = function(pos, exprAllowed) {
      tokPos = pos;
      if (options.locations) {
        tokCurLine = 1;
        tokLineStart = lineBreak.lastIndex = 0;
        var match;
        while ((match = lineBreak.exec(input)) && match.index < pos) {
          ++tokCurLine;
          tokLineStart = match.index + match[0].length;
        }
      }
      tokExprAllowed = !!exprAllowed;
      skipSpace();
    };
    getToken.current = function() { return new Token(); };
    if (typeof Symbol !== 'undefined') {
      getToken[Symbol.iterator] = function () {
        return {
          next: function () {
            var token = getToken();
            return {
              done: token.type === _eof,
              value: token
            };
          }
        };
      };
    }
    getToken.options = options;
    return getToken;
  };

  // State is kept in (closure-)global variables. We already saw the
  // `options`, `input`, and `inputLen` variables above.

  // The current position of the tokenizer in the input.

  var tokPos;

  // The start and end offsets of the current token.

  var tokStart, tokEnd;

  // When `options.locations` is true, these hold objects
  // containing the tokens start and end line/column pairs.

  var tokStartLoc, tokEndLoc;

  // The type and value of the current token. Token types are objects,
  // named by variables against which they can be compared, and
  // holding properties that describe them (indicating, for example,
  // the precedence of an infix operator, and the original name of a
  // keyword token). The kind of value that's held in `tokVal` depends
  // on the type of the token. For literals, it is the literal value,
  // for operators, the operator name, and so on.

  var tokType, tokVal;

  // Internal state for the tokenizer. To distinguish between division
  // operators and regular expressions, it remembers whether the last
  // token was one that is allowed to be followed by an expression. In
  // some cases, notably after ')' or '}' tokens, the situation
  // depends on the context before the matching opening bracket, so
  // tokContext keeps a stack of information about current bracketed
  // forms.

  var tokContext, tokExprAllowed;

  // When `options.locations` is true, these are used to keep
  // track of the current line, and know when a new line has been
  // entered.

  var tokCurLine, tokLineStart;

  // These store the position of the previous token, which is useful
  // when finishing a node and assigning its `end` position.

  var lastStart, lastEnd, lastEndLoc;

  // This is the parser's state. `inFunction` is used to reject
  // `return` statements outside of functions, `inGenerator` to
  // reject `yield`s outside of generators, `labels` to verify
  // that `break` and `continue` have somewhere to jump to, and
  // `strict` indicates whether strict mode is on.

  var inFunction, inGenerator, labels, strict;

  function initParserState() {
    lastStart = lastEnd = tokPos;
    if (options.locations) lastEndLoc = curPosition();
    inFunction = inGenerator = false;
    labels = [];
    skipSpace();
    readToken();
  }

  // This function is used to raise exceptions on parse errors. It
  // takes an offset integer (into the current `input`) to indicate
  // the location of the error, attaches the position to the end
  // of the error message, and then raises a `SyntaxError` with that
  // message.

  function raise(pos, message) {
    var loc = getLineInfo(input, pos);
    message += " (" + loc.line + ":" + loc.column + ")";
    var err = new SyntaxError(message);
    err.pos = pos; err.loc = loc; err.raisedAt = tokPos;
    throw err;
  }

  function fullCharCodeAtPos() {
    var code = input.charCodeAt(tokPos);
    if (code <= 0xd7ff || code >= 0xe000) return code;
    var next = input.charCodeAt(tokPos + 1);
    return (code << 10) + next - 0x35fdc00;
  }

  function skipChar(code) {
    if (code <= 0xffff) tokPos++;
    else tokPos += 2;
  }

  // Reused empty array added for node fields that are always empty.

  var empty = [];

  // ## Token types

  // The assignment of fine-grained, information-carrying type objects
  // allows the tokenizer to store the information it has about a
  // token in a way that is very cheap for the parser to look up.

  // All token type variables start with an underscore, to make them
  // easy to recognize.

  // These are the general types. The `type` property is only used to
  // make them recognizeable when debugging.

  var _num = {type: "num"}, _regexp = {type: "regexp"}, _string = {type: "string"};
  var _name = {type: "name"}, _eof = {type: "eof"};

  // Keyword tokens. The `keyword` property (also used in keyword-like
  // operators) indicates that the token originated from an
  // identifier-like word, which is used when parsing property names.
  //
  // The `beforeExpr` property is used to disambiguate between regular
  // expressions and divisions. It is set on all token types that can
  // be followed by an expression (thus, a slash after them would be a
  // regular expression).
  //
  // `isLoop` marks a keyword as starting a loop, which is important
  // to know when parsing a label, in order to allow or disallow
  // continue jumps to that label.

  var _break = {keyword: "break"}, _case = {keyword: "case", beforeExpr: true}, _catch = {keyword: "catch"};
  var _continue = {keyword: "continue"}, _debugger = {keyword: "debugger"}, _default = {keyword: "default"};
  var _do = {keyword: "do", isLoop: true}, _else = {keyword: "else", beforeExpr: true};
  var _finally = {keyword: "finally"}, _for = {keyword: "for", isLoop: true}, _function = {keyword: "function"};
  var _if = {keyword: "if"}, _return = {keyword: "return", beforeExpr: true}, _switch = {keyword: "switch"};
  var _throw = {keyword: "throw", beforeExpr: true}, _try = {keyword: "try"}, _var = {keyword: "var"};
  var _let = {keyword: "let"}, _const = {keyword: "const"};
  var _while = {keyword: "while", isLoop: true}, _with = {keyword: "with"}, _new = {keyword: "new", beforeExpr: true};
  var _this = {keyword: "this"};
  var _class = {keyword: "class"}, _extends = {keyword: "extends", beforeExpr: true};
  var _export = {keyword: "export"}, _import = {keyword: "import"};
  var _yield = {keyword: "yield", beforeExpr: true};

  // The keywords that denote values.

  var _null = {keyword: "null", atomValue: null}, _true = {keyword: "true", atomValue: true};
  var _false = {keyword: "false", atomValue: false};

  // Some keywords are treated as regular operators. `in` sometimes
  // (when parsing `for`) needs to be tested against specifically, so
  // we assign a variable name to it for quick comparing.

  var _in = {keyword: "in", binop: 7, beforeExpr: true};

  // Map keyword names to token types.

  var keywordTypes = {"break": _break, "case": _case, "catch": _catch,
                      "continue": _continue, "debugger": _debugger, "default": _default,
                      "do": _do, "else": _else, "finally": _finally, "for": _for,
                      "function": _function, "if": _if, "return": _return, "switch": _switch,
                      "throw": _throw, "try": _try, "var": _var, "let": _let, "const": _const,
                      "while": _while, "with": _with,
                      "null": _null, "true": _true, "false": _false, "new": _new, "in": _in,
                      "instanceof": {keyword: "instanceof", binop: 7, beforeExpr: true}, "this": _this,
                      "typeof": {keyword: "typeof", prefix: true, beforeExpr: true},
                      "void": {keyword: "void", prefix: true, beforeExpr: true},
                      "delete": {keyword: "delete", prefix: true, beforeExpr: true},
                      "class": _class, "extends": _extends,
                      "export": _export, "import": _import, "yield": _yield};

  // Punctuation token types. Again, the `type` property is purely for debugging.

  var _bracketL = {type: "[", beforeExpr: true}, _bracketR = {type: "]"}, _braceL = {type: "{", beforeExpr: true};
  var _braceR = {type: "}"}, _parenL = {type: "(", beforeExpr: true}, _parenR = {type: ")"};
  var _comma = {type: ",", beforeExpr: true}, _semi = {type: ";", beforeExpr: true};
  var _colon = {type: ":", beforeExpr: true}, _dot = {type: "."}, _question = {type: "?", beforeExpr: true};
  var _arrow = {type: "=>", beforeExpr: true}, _template = {type: "template"};
  var _ellipsis = {type: "...", beforeExpr: true};
  var _backQuote = {type: "`"}, _dollarBraceL = {type: "${", beforeExpr: true};

  // Operators. These carry several kinds of properties to help the
  // parser use them properly (the presence of these properties is
  // what categorizes them as operators).
  //
  // `binop`, when present, specifies that this operator is a binary
  // operator, and will refer to its precedence.
  //
  // `prefix` and `postfix` mark the operator as a prefix or postfix
  // unary operator. `isUpdate` specifies that the node produced by
  // the operator should be of type UpdateExpression rather than
  // simply UnaryExpression (`++` and `--`).
  //
  // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
  // binary operators with a very low precedence, that should result
  // in AssignmentExpression nodes.

  var _slash = {binop: 10, beforeExpr: true}, _eq = {isAssign: true, beforeExpr: true};
  var _assign = {isAssign: true, beforeExpr: true};
  var _incDec = {postfix: true, prefix: true, isUpdate: true}, _prefix = {prefix: true, beforeExpr: true};
  var _logicalOR = {binop: 1, beforeExpr: true};
  var _logicalAND = {binop: 2, beforeExpr: true};
  var _bitwiseOR = {binop: 3, beforeExpr: true};
  var _bitwiseXOR = {binop: 4, beforeExpr: true};
  var _bitwiseAND = {binop: 5, beforeExpr: true};
  var _equality = {binop: 6, beforeExpr: true};
  var _relational = {binop: 7, beforeExpr: true};
  var _bitShift = {binop: 8, beforeExpr: true};
  var _plusMin = {binop: 9, prefix: true, beforeExpr: true};
  var _modulo = {binop: 10, beforeExpr: true};

  // '*' may be multiply or have special meaning in ES6
  var _star = {binop: 10, beforeExpr: true};

  // Provide access to the token types for external users of the
  // tokenizer.

  exports.tokTypes = {bracketL: _bracketL, bracketR: _bracketR, braceL: _braceL, braceR: _braceR,
                      parenL: _parenL, parenR: _parenR, comma: _comma, semi: _semi, colon: _colon,
                      dot: _dot, ellipsis: _ellipsis, question: _question, slash: _slash, eq: _eq,
                      name: _name, eof: _eof, num: _num, regexp: _regexp, string: _string,
                      arrow: _arrow, template: _template, star: _star, assign: _assign,
                      backQuote: _backQuote, dollarBraceL: _dollarBraceL};
  for (var kw in keywordTypes) exports.tokTypes["_" + kw] = keywordTypes[kw];

  // This is a trick taken from Esprima. It turns out that, on
  // non-Chrome browsers, to check whether a string is in a set, a
  // predicate containing a big ugly `switch` statement is faster than
  // a regular expression, and on Chrome the two are about on par.
  // This function uses `eval` (non-lexical) to produce such a
  // predicate from a space-separated string of words.
  //
  // It starts by sorting the words by length.

  function makePredicate(words) {
    words = words.split(" ");
    var f = "", cats = [];
    out: for (var i = 0; i < words.length; ++i) {
      for (var j = 0; j < cats.length; ++j)
        if (cats[j][0].length == words[i].length) {
          cats[j].push(words[i]);
          continue out;
        }
      cats.push([words[i]]);
    }
    function compareTo(arr) {
      if (arr.length == 1) return f += "return str === " + JSON.stringify(arr[0]) + ";";
      f += "switch(str){";
      for (var i = 0; i < arr.length; ++i) f += "case " + JSON.stringify(arr[i]) + ":";
      f += "return true}return false;";
    }

    // When there are more than three length categories, an outer
    // switch first dispatches on the lengths, to save on comparisons.

    if (cats.length > 3) {
      cats.sort(function(a, b) {return b.length - a.length;});
      f += "switch(str.length){";
      for (var i = 0; i < cats.length; ++i) {
        var cat = cats[i];
        f += "case " + cat[0].length + ":";
        compareTo(cat);
      }
      f += "}";

    // Otherwise, simply generate a flat `switch` statement.

    } else {
      compareTo(words);
    }
    return new Function("str", f);
  }

  // The ECMAScript 3 reserved word list.

  var isReservedWord3 = makePredicate("abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile");

  // ECMAScript 5 reserved words.

  var isReservedWord5 = makePredicate("class enum extends super const export import");

  // The additional reserved words in strict mode.

  var isStrictReservedWord = makePredicate("implements interface let package private protected public static yield");

  // The forbidden variable names in strict mode.

  var isStrictBadIdWord = makePredicate("eval arguments");

  // And the keywords.

  var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";

  var isEcma5AndLessKeyword = makePredicate(ecma5AndLessKeywords);

  var isEcma6Keyword = makePredicate(ecma5AndLessKeywords + " let const class extends export import yield");

  var isKeyword = isEcma5AndLessKeyword;

  // ## Character categories

  // Big ugly regular expressions that match characters in the
  // whitespace, identifier, and identifier-start categories. These
  // are only applied when a character is found to actually have a
  // code point above 128.
  // Generated by `tools/generate-identifier-regex.js`.

  var nonASCIIwhitespace = /[\u1680\u180e\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
  var nonASCIIidentifierStartChars = "\xaa\xb5\xba\xc0-\xd6\xd8-\xf6\xf8-\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481\u048a-\u052f\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0-\u08b2\u0904-\u0939\u093d\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0b05-\u0b0c\u0b0f\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58\u0c59\u0c60\u0c61\u0c85-\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d60\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f4\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16ee-\u16f8\u1700-\u170c\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-\u196d\u1970-\u1974\u1980-\u19ab\u19c1-\u19c7\u1a00-\u1a16\u1a20-\u1a54\u1aa7\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2118-\u211d\u2124\u2126\u2128\u212a-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2160-\u2188\u2c00-\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303c\u3041-\u3096\u309b-\u309f\u30a1-\u30fa\u30fc-\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-\u9fcc\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-\ua66e\ua67f-\ua69d\ua6a0-\ua6ef\ua717-\ua71f\ua722-\ua788\ua78b-\ua78e\ua790-\ua7ad\ua7b0\ua7b1\ua7f7-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-\ua8b3\ua8f2-\ua8f7\ua8fb\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab5f\uab64\uab65\uabc0-\uabe2\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc";
  var nonASCIIidentifierChars = "\u200c\u200d\xb7\u0300-\u036f\u0387\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u0669\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u06f0-\u06f9\u0711\u0730-\u074a\u07a6-\u07b0\u07c0-\u07c9\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0859-\u085b\u08e4-\u0903\u093a-\u093c\u093e-\u094f\u0951-\u0957\u0962\u0963\u0966-\u096f\u0981-\u0983\u09bc\u09be-\u09c4\u09c7\u09c8\u09cb-\u09cd\u09d7\u09e2\u09e3\u09e6-\u09ef\u0a01-\u0a03\u0a3c\u0a3e-\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a66-\u0a71\u0a75\u0a81-\u0a83\u0abc\u0abe-\u0ac5\u0ac7-\u0ac9\u0acb-\u0acd\u0ae2\u0ae3\u0ae6-\u0aef\u0b01-\u0b03\u0b3c\u0b3e-\u0b44\u0b47\u0b48\u0b4b-\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b66-\u0b6f\u0b82\u0bbe-\u0bc2\u0bc6-\u0bc8\u0bca-\u0bcd\u0bd7\u0be6-\u0bef\u0c00-\u0c03\u0c3e-\u0c44\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0c66-\u0c6f\u0c81-\u0c83\u0cbc\u0cbe-\u0cc4\u0cc6-\u0cc8\u0cca-\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0ce6-\u0cef\u0d01-\u0d03\u0d3e-\u0d44\u0d46-\u0d48\u0d4a-\u0d4d\u0d57\u0d62\u0d63\u0d66-\u0d6f\u0d82\u0d83\u0dca\u0dcf-\u0dd4\u0dd6\u0dd8-\u0ddf\u0de6-\u0def\u0df2\u0df3\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0e50-\u0e59\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0ed0-\u0ed9\u0f18\u0f19\u0f20-\u0f29\u0f35\u0f37\u0f39\u0f3e\u0f3f\u0f71-\u0f84\u0f86\u0f87\u0f8d-\u0f97\u0f99-\u0fbc\u0fc6\u102b-\u103e\u1040-\u1049\u1056-\u1059\u105e-\u1060\u1062-\u1064\u1067-\u106d\u1071-\u1074\u1082-\u108d\u108f-\u109d\u135d-\u135f\u1369-\u1371\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b4-\u17d3\u17dd\u17e0-\u17e9\u180b-\u180d\u1810-\u1819\u18a9\u1920-\u192b\u1930-\u193b\u1946-\u194f\u19b0-\u19c0\u19c8\u19c9\u19d0-\u19da\u1a17-\u1a1b\u1a55-\u1a5e\u1a60-\u1a7c\u1a7f-\u1a89\u1a90-\u1a99\u1ab0-\u1abd\u1b00-\u1b04\u1b34-\u1b44\u1b50-\u1b59\u1b6b-\u1b73\u1b80-\u1b82\u1ba1-\u1bad\u1bb0-\u1bb9\u1be6-\u1bf3\u1c24-\u1c37\u1c40-\u1c49\u1c50-\u1c59\u1cd0-\u1cd2\u1cd4-\u1ce8\u1ced\u1cf2-\u1cf4\u1cf8\u1cf9\u1dc0-\u1df5\u1dfc-\u1dff\u203f\u2040\u2054\u20d0-\u20dc\u20e1\u20e5-\u20f0\u2cef-\u2cf1\u2d7f\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua620-\ua629\ua66f\ua674-\ua67d\ua69f\ua6f0\ua6f1\ua802\ua806\ua80b\ua823-\ua827\ua880\ua881\ua8b4-\ua8c4\ua8d0-\ua8d9\ua8e0-\ua8f1\ua900-\ua909\ua926-\ua92d\ua947-\ua953\ua980-\ua983\ua9b3-\ua9c0\ua9d0-\ua9d9\ua9e5\ua9f0-\ua9f9\uaa29-\uaa36\uaa43\uaa4c\uaa4d\uaa50-\uaa59\uaa7b-\uaa7d\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uaaeb-\uaaef\uaaf5\uaaf6\uabe3-\uabea\uabec\uabed\uabf0-\uabf9\ufb1e\ufe00-\ufe0f\ufe20-\ufe2d\ufe33\ufe34\ufe4d-\ufe4f\uff10-\uff19\uff3f";

  var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
  var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
  nonASCIIidentifierStartChars = nonASCIIidentifierChars = null;

  // These are a run-length and offset encoded representation of the
  // >0xffff code points that are a valid part of identifiers. The
  // offset starts at 0x10000, and each pair of numbers represents an
  // offset to the next range, and then a size of the range. They were
  // generated by tools/generate-identifier-regex.js
  var astralIdentifierStartCodes = [0,11,2,25,2,18,2,1,2,14,3,13,35,122,70,52,268,28,4,48,48,31,17,26,6,37,11,29,3,35,5,7,2,4,43,157,99,39,9,51,157,310,10,21,11,7,153,5,3,0,2,43,2,1,4,0,3,22,11,22,10,30,98,21,11,25,71,55,7,1,65,0,16,3,2,2,2,26,45,28,4,28,36,7,2,27,28,53,11,21,11,18,14,17,111,72,955,52,76,44,33,24,27,35,42,34,4,0,13,47,15,3,22,0,38,17,2,24,133,46,39,7,3,1,3,21,2,6,2,1,2,4,4,0,32,4,287,47,21,1,2,0,185,46,82,47,21,0,60,42,502,63,32,0,449,56,1288,920,104,110,2962,1070,13266,568,8,30,114,29,19,47,17,3,32,20,6,18,881,68,12,0,67,12,16481,1,3071,106,6,12,4,8,8,9,5991,84,2,70,2,1,3,0,3,1,3,3,2,11,2,0,2,6,2,64,2,3,3,7,2,6,2,27,2,3,2,4,2,0,4,6,2,339,3,24,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,30,2,24,2,7,4149,196,1340,3,2,26,2,1,2,0,3,0,2,9,2,3,2,0,2,0,7,0,5,0,2,0,2,0,2,2,2,1,2,0,3,0,2,0,2,0,2,0,2,0,2,1,2,0,3,3,2,6,2,3,2,3,2,0,2,9,2,16,6,2,2,4,2,16,4421,42710,42,4148,12,221,16355,541];
  var astralIdentifierCodes = [509,0,227,0,150,4,294,9,1368,2,2,1,6,3,41,2,5,0,166,1,1306,2,54,14,32,9,16,3,46,10,54,9,7,2,37,13,2,9,52,0,13,2,49,13,16,9,83,11,168,11,6,9,8,2,57,0,2,6,3,1,3,2,10,0,11,1,3,6,4,4,316,19,13,9,214,6,3,8,112,16,16,9,82,12,9,9,535,9,20855,9,135,4,60,6,26,9,1016,45,17,3,19723,1,5319,4,4,5,9,7,3,6,31,3,149,2,1418,49,4305,6,792618,239];

  // This has a complexity linear to the value of the code. The
  // assumption is that looking up astral identifier characters is
  // rare.
  function isInAstralSet(code, set) {
    var pos = 0x10000;
    for (var i = 0; i < set.length; i += 2) {
      pos += set[i];
      if (pos > code) return false;
      pos += set[i + 1];
      if (pos >= code) return true;
    }
  }

  // Whether a single character denotes a newline.

  var newline = /[\n\r\u2028\u2029]/;

  function isNewLine(code) {
    return code === 10 || code === 13 || code === 0x2028 || code == 0x2029;
  }

  // Matches a whole line break (where CRLF is considered a single
  // line break). Used to count lines.

  var lineBreak = /\r\n|[\n\r\u2028\u2029]/g;

  // Test whether a given character code starts an identifier.

  var isIdentifierStart = exports.isIdentifierStart = function(code, astral) {
    if (code < 65) return code === 36;
    if (code < 91) return true;
    if (code < 97) return code === 95;
    if (code < 123) return true;
    if (code <= 0xffff) return code >= 0xaa && nonASCIIidentifierStart.test(String.fromCharCode(code));
    if (astral === false) return false;
    return isInAstralSet(code, astralIdentifierStartCodes);
  };

  // Test whether a given character is part of an identifier.

  var isIdentifierChar = exports.isIdentifierChar = function(code, astral) {
    if (code < 48) return code === 36;
    if (code < 58) return true;
    if (code < 65) return false;
    if (code < 91) return true;
    if (code < 97) return code === 95;
    if (code < 123) return true;
    if (code <= 0xffff) return code >= 0xaa && nonASCIIidentifier.test(String.fromCharCode(code));
    if (astral === false) return false;
    return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
  };

  // ## Tokenizer

  // These are used when `options.locations` is on, for the
  // `tokStartLoc` and `tokEndLoc` properties.

  function Position(line, col) {
    this.line = line;
    this.column = col;
  }

  Position.prototype.offset = function(n) {
    return new Position(this.line, this.column + n);
  };

  function curPosition() {
    return new Position(tokCurLine, tokPos - tokLineStart);
  }

  // Reset the token state. Used at the start of a parse.

  function initTokenState(pos) {
    if (pos) {
      tokPos = pos;
      tokLineStart = Math.max(0, input.lastIndexOf("\n", pos));
      tokCurLine = input.slice(0, tokLineStart).split(newline).length;
    } else {
      tokCurLine = 1;
      tokPos = tokLineStart = 0;
    }
    tokType = _eof;
    tokContext = [b_stat];
    tokExprAllowed = true;
    strict = false;
    if (tokPos === 0 && options.allowHashBang && input.slice(0, 2) === '#!') {
      skipLineComment(2);
    }
  }

  // The algorithm used to determine whether a regexp can appear at a
  // given point in the program is loosely based on sweet.js' approach.
  // See https://github.com/mozilla/sweet.js/wiki/design

  var b_stat = {token: "{", isExpr: false}, b_expr = {token: "{", isExpr: true}, b_tmpl = {token: "${", isExpr: true};
  var p_stat = {token: "(", isExpr: false}, p_expr = {token: "(", isExpr: true};
  var q_tmpl = {token: "`", isExpr: true}, f_expr = {token: "function", isExpr: true};

  function curTokContext() {
    return tokContext[tokContext.length - 1];
  }

  function braceIsBlock(prevType) {
    var parent;
    if (prevType === _colon && (parent = curTokContext()).token == "{")
      return !parent.isExpr;
    if (prevType === _return)
      return newline.test(input.slice(lastEnd, tokStart));
    if (prevType === _else || prevType === _semi || prevType === _eof)
      return true;
    if (prevType == _braceL)
      return curTokContext() === b_stat;
    return !tokExprAllowed;
  }

  // Called at the end of every token. Sets `tokEnd`, `tokVal`, and
  // maintains `tokContext` and `tokExprAllowed`, and skips the space
  // after the token, so that the next one's `tokStart` will point at
  // the right position.

  function finishToken(type, val) {
    tokEnd = tokPos;
    if (options.locations) tokEndLoc = curPosition();
    var prevType = tokType, preserveSpace = false;
    tokType = type;
    tokVal = val;

    // Update context info
    if (type === _parenR || type === _braceR) {
      var out = tokContext.pop();
      if (out === b_tmpl) {
        preserveSpace = true;
      } else if (out === b_stat && curTokContext() === f_expr) {
        tokContext.pop();
        tokExprAllowed = false;
      } else {
        tokExprAllowed = !(out && out.isExpr);
      }
    } else if (type === _braceL) {
      tokContext.push(braceIsBlock(prevType) ? b_stat : b_expr);
      tokExprAllowed = true;
    } else if (type === _dollarBraceL) {
      tokContext.push(b_tmpl);
      tokExprAllowed = true;
    } else if (type == _parenL) {
      var statementParens = prevType === _if || prevType === _for || prevType === _with || prevType === _while;
      tokContext.push(statementParens ? p_stat : p_expr);
      tokExprAllowed = true;
    } else if (type == _incDec) {
      // tokExprAllowed stays unchanged
    } else if (type.keyword && prevType == _dot) {
      tokExprAllowed = false;
    } else if (type == _function) {
      if (curTokContext() !== b_stat) {
        tokContext.push(f_expr);
      }
      tokExprAllowed = false;
    } else if (type === _backQuote) {
      if (curTokContext() === q_tmpl) {
        tokContext.pop();
      } else {
        tokContext.push(q_tmpl);
        preserveSpace = true;
      }
      tokExprAllowed = false;
    } else {
      tokExprAllowed = type.beforeExpr;
    }

    if (!preserveSpace) skipSpace();
  }

  function skipBlockComment() {
    var startLoc = options.onComment && options.locations && curPosition();
    var start = tokPos, end = input.indexOf("*/", tokPos += 2);
    if (end === -1) raise(tokPos - 2, "Unterminated comment");
    tokPos = end + 2;
    if (options.locations) {
      lineBreak.lastIndex = start;
      var match;
      while ((match = lineBreak.exec(input)) && match.index < tokPos) {
        ++tokCurLine;
        tokLineStart = match.index + match[0].length;
      }
    }
    if (options.onComment)
      options.onComment(true, input.slice(start + 2, end), start, tokPos,
                        startLoc, options.locations && curPosition());
  }

  function skipLineComment(startSkip) {
    var start = tokPos;
    var startLoc = options.onComment && options.locations && curPosition();
    var ch = input.charCodeAt(tokPos+=startSkip);
    while (tokPos < inputLen && ch !== 10 && ch !== 13 && ch !== 8232 && ch !== 8233) {
      ++tokPos;
      ch = input.charCodeAt(tokPos);
    }
    if (options.onComment)
      options.onComment(false, input.slice(start + startSkip, tokPos), start, tokPos,
                        startLoc, options.locations && curPosition());
  }

  // Called at the start of the parse and after every token. Skips
  // whitespace and comments, and.

  function skipSpace() {
    while (tokPos < inputLen) {
      var ch = input.charCodeAt(tokPos);
      if (ch === 32) { // ' '
        ++tokPos;
      } else if (ch === 13) {
        ++tokPos;
        var next = input.charCodeAt(tokPos);
        if (next === 10) {
          ++tokPos;
        }
        if (options.locations) {
          ++tokCurLine;
          tokLineStart = tokPos;
        }
      } else if (ch === 10 || ch === 8232 || ch === 8233) {
        ++tokPos;
        if (options.locations) {
          ++tokCurLine;
          tokLineStart = tokPos;
        }
      } else if (ch > 8 && ch < 14) {
        ++tokPos;
      } else if (ch === 47) { // '/'
        var next = input.charCodeAt(tokPos + 1);
        if (next === 42) { // '*'
          skipBlockComment();
        } else if (next === 47) { // '/'
          skipLineComment(2);
        } else break;
      } else if (ch === 160) { // '\xa0'
        ++tokPos;
      } else if (ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
        ++tokPos;
      } else {
        break;
      }
    }
  }

  // ### Token reading

  // This is the function that is called to fetch the next token. It
  // is somewhat obscure, because it works in character codes rather
  // than characters, and because operator parsing has been inlined
  // into it.
  //
  // All in the name of speed.
  //
  function readToken_dot() {
    var next = input.charCodeAt(tokPos + 1);
    if (next >= 48 && next <= 57) return readNumber(true);
    var next2 = input.charCodeAt(tokPos + 2);
    if (options.ecmaVersion >= 6 && next === 46 && next2 === 46) { // 46 = dot '.'
      tokPos += 3;
      return finishToken(_ellipsis);
    } else {
      ++tokPos;
      return finishToken(_dot);
    }
  }

  function readToken_slash() { // '/'
    var next = input.charCodeAt(tokPos + 1);
    if (tokExprAllowed) {++tokPos; return readRegexp();}
    if (next === 61) return finishOp(_assign, 2);
    return finishOp(_slash, 1);
  }

  function readToken_mult_modulo(code) { // '%*'
    var next = input.charCodeAt(tokPos + 1);
    if (next === 61) return finishOp(_assign, 2);
    return finishOp(code === 42 ? _star : _modulo, 1);
  }

  function readToken_pipe_amp(code) { // '|&'
    var next = input.charCodeAt(tokPos + 1);
    if (next === code) return finishOp(code === 124 ? _logicalOR : _logicalAND, 2);
    if (next === 61) return finishOp(_assign, 2);
    return finishOp(code === 124 ? _bitwiseOR : _bitwiseAND, 1);
  }

  function readToken_caret() { // '^'
    var next = input.charCodeAt(tokPos + 1);
    if (next === 61) return finishOp(_assign, 2);
    return finishOp(_bitwiseXOR, 1);
  }

  function readToken_plus_min(code) { // '+-'
    var next = input.charCodeAt(tokPos + 1);
    if (next === code) {
      if (next == 45 && input.charCodeAt(tokPos + 2) == 62 &&
          newline.test(input.slice(lastEnd, tokPos))) {
        // A `-->` line comment
        skipLineComment(3);
        skipSpace();
        return readToken();
      }
      return finishOp(_incDec, 2);
    }
    if (next === 61) return finishOp(_assign, 2);
    return finishOp(_plusMin, 1);
  }

  function readToken_lt_gt(code) { // '<>'
    var next = input.charCodeAt(tokPos + 1);
    var size = 1;
    if (next === code) {
      size = code === 62 && input.charCodeAt(tokPos + 2) === 62 ? 3 : 2;
      if (input.charCodeAt(tokPos + size) === 61) return finishOp(_assign, size + 1);
      return finishOp(_bitShift, size);
    }
    if (next == 33 && code == 60 && input.charCodeAt(tokPos + 2) == 45 &&
        input.charCodeAt(tokPos + 3) == 45) {
      // `<!--`, an XML-style comment that should be interpreted as a line comment
      skipLineComment(4);
      skipSpace();
      return readToken();
    }
    if (next === 61)
      size = input.charCodeAt(tokPos + 2) === 61 ? 3 : 2;
    return finishOp(_relational, size);
  }

  function readToken_eq_excl(code) { // '=!', '=>'
    var next = input.charCodeAt(tokPos + 1);
    if (next === 61) return finishOp(_equality, input.charCodeAt(tokPos + 2) === 61 ? 3 : 2);
    if (code === 61 && next === 62 && options.ecmaVersion >= 6) { // '=>'
      tokPos += 2;
      return finishToken(_arrow);
    }
    return finishOp(code === 61 ? _eq : _prefix, 1);
  }

  function getTokenFromCode(code) {
    switch (code) {
    // The interpretation of a dot depends on whether it is followed
    // by a digit or another two dots.
    case 46: // '.'
      return readToken_dot();

    // Punctuation tokens.
    case 40: ++tokPos; return finishToken(_parenL);
    case 41: ++tokPos; return finishToken(_parenR);
    case 59: ++tokPos; return finishToken(_semi);
    case 44: ++tokPos; return finishToken(_comma);
    case 91: ++tokPos; return finishToken(_bracketL);
    case 93: ++tokPos; return finishToken(_bracketR);
    case 123: ++tokPos; return finishToken(_braceL);
    case 125: ++tokPos; return finishToken(_braceR);
    case 58: ++tokPos; return finishToken(_colon);
    case 63: ++tokPos; return finishToken(_question);

    case 96: // '`'
      if (options.ecmaVersion < 6) break;
      ++tokPos;
      return finishToken(_backQuote);

    case 48: // '0'
      var next = input.charCodeAt(tokPos + 1);
      if (next === 120 || next === 88) return readRadixNumber(16); // '0x', '0X' - hex number
      if (options.ecmaVersion >= 6) {
        if (next === 111 || next === 79) return readRadixNumber(8); // '0o', '0O' - octal number
        if (next === 98 || next === 66) return readRadixNumber(2); // '0b', '0B' - binary number
      }
    // Anything else beginning with a digit is an integer, octal
    // number, or float.
    case 49: case 50: case 51: case 52: case 53: case 54: case 55: case 56: case 57: // 1-9
      return readNumber(false);

    // Quotes produce strings.
    case 34: case 39: // '"', "'"
      return readString(code);

    // Operators are parsed inline in tiny state machines. '=' (61) is
    // often referred to. `finishOp` simply skips the amount of
    // characters it is given as second argument, and returns a token
    // of the type given by its first argument.

    case 47: // '/'
      return readToken_slash();

    case 37: case 42: // '%*'
      return readToken_mult_modulo(code);

    case 124: case 38: // '|&'
      return readToken_pipe_amp(code);

    case 94: // '^'
      return readToken_caret();

    case 43: case 45: // '+-'
      return readToken_plus_min(code);

    case 60: case 62: // '<>'
      return readToken_lt_gt(code);

    case 61: case 33: // '=!'
      return readToken_eq_excl(code);

    case 126: // '~'
      return finishOp(_prefix, 1);
    }

    raise(tokPos, "Unexpected character '" + codePointToString(code) + "'");
  }

  function readToken() {
    tokStart = tokPos;
    if (options.locations) tokStartLoc = curPosition();
    if (tokPos >= inputLen) return finishToken(_eof);

    if (curTokContext() === q_tmpl) {
      return readTmplToken();
    }

    var code = fullCharCodeAtPos();

    // Identifier or keyword. '\uXXXX' sequences are allowed in
    // identifiers, so '\' also dispatches to that.
    if (isIdentifierStart(code, options.ecmaVersion >= 6) || code === 92 /* '\' */) return readWord();

    return getTokenFromCode(code);
  }

  function finishOp(type, size) {
    var str = input.slice(tokPos, tokPos + size);
    tokPos += size;
    finishToken(type, str);
  }

  var regexpUnicodeSupport = false;
  try { new RegExp("\uffff", "u"); regexpUnicodeSupport = true; }
  catch(e) {}

  // Parse a regular expression. Some context-awareness is necessary,
  // since a '/' inside a '[]' set does not end the expression.

  function readRegexp() {
    var content = "", escaped, inClass, start = tokPos;
    for (;;) {
      if (tokPos >= inputLen) raise(start, "Unterminated regular expression");
      var ch = input.charAt(tokPos);
      if (newline.test(ch)) raise(start, "Unterminated regular expression");
      if (!escaped) {
        if (ch === "[") inClass = true;
        else if (ch === "]" && inClass) inClass = false;
        else if (ch === "/" && !inClass) break;
        escaped = ch === "\\";
      } else escaped = false;
      ++tokPos;
    }
    var content = input.slice(start, tokPos);
    ++tokPos;
    // Need to use `readWord1` because '\uXXXX' sequences are allowed
    // here (don't ask).
    var mods = readWord1();
    var tmp = content;
    if (mods) {
      var validFlags = /^[gmsiy]*$/;
      if (options.ecmaVersion >= 6) validFlags = /^[gmsiyu]*$/;
      if (!validFlags.test(mods)) raise(start, "Invalid regular expression flag");
      if (mods.indexOf('u') >= 0 && !regexpUnicodeSupport) {
        // Replace each astral symbol and every Unicode code point
        // escape sequence that represents such a symbol with a single
        // ASCII symbol to avoid throwing on regular expressions that
        // are only valid in combination with the `/u` flag.
        tmp = tmp
          .replace(/\\u\{([0-9a-fA-F]{5,6})\}/g, "x")
          .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "x");
      }
    }
    // Detect invalid regular expressions.
    try {
      new RegExp(tmp);
    } catch (e) {
      if (e instanceof SyntaxError) raise(start, "Error parsing regular expression: " + e.message);
      raise(e);
    }
    // Get a regular expression object for this pattern-flag pair, or `null` in
    // case the current environment doesn't support the flags it uses.
    try {
      var value = new RegExp(content, mods);
    } catch (err) {
      value = null;
    }
    return finishToken(_regexp, {pattern: content, flags: mods, value: value});
  }

  // Read an integer in the given radix. Return null if zero digits
  // were read, the integer value otherwise. When `len` is given, this
  // will return `null` unless the integer has exactly `len` digits.

  function readInt(radix, len) {
    var start = tokPos, total = 0;
    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i) {
      var code = input.charCodeAt(tokPos), val;
      if (code >= 97) val = code - 97 + 10; // a
      else if (code >= 65) val = code - 65 + 10; // A
      else if (code >= 48 && code <= 57) val = code - 48; // 0-9
      else val = Infinity;
      if (val >= radix) break;
      ++tokPos;
      total = total * radix + val;
    }
    if (tokPos === start || len != null && tokPos - start !== len) return null;

    return total;
  }

  function readRadixNumber(radix) {
    tokPos += 2; // 0x
    var val = readInt(radix);
    if (val == null) raise(tokStart + 2, "Expected number in radix " + radix);
    if (isIdentifierStart(fullCharCodeAtPos())) raise(tokPos, "Identifier directly after number");
    return finishToken(_num, val);
  }

  // Read an integer, octal integer, or floating-point number.

  function readNumber(startsWithDot) {
    var start = tokPos, isFloat = false, octal = input.charCodeAt(tokPos) === 48;
    if (!startsWithDot && readInt(10) === null) raise(start, "Invalid number");
    if (input.charCodeAt(tokPos) === 46) {
      ++tokPos;
      readInt(10);
      isFloat = true;
    }
    var next = input.charCodeAt(tokPos);
    if (next === 69 || next === 101) { // 'eE'
      next = input.charCodeAt(++tokPos);
      if (next === 43 || next === 45) ++tokPos; // '+-'
      if (readInt(10) === null) raise(start, "Invalid number");
      isFloat = true;
    }
    if (isIdentifierStart(fullCharCodeAtPos())) raise(tokPos, "Identifier directly after number");

    var str = input.slice(start, tokPos), val;
    if (isFloat) val = parseFloat(str);
    else if (!octal || str.length === 1) val = parseInt(str, 10);
    else if (/[89]/.test(str) || strict) raise(start, "Invalid number");
    else val = parseInt(str, 8);
    return finishToken(_num, val);
  }

  // Read a string value, interpreting backslash-escapes.

  function readCodePoint() {
    var ch = input.charCodeAt(tokPos), code;

    if (ch === 123) {
      if (options.ecmaVersion < 6) unexpected();
      ++tokPos;
      code = readHexChar(input.indexOf('}', tokPos) - tokPos);
      ++tokPos;
      if (code > 0x10FFFF) unexpected();
    } else {
      code = readHexChar(4);
    }
    return code;
  }

  function codePointToString(code) {
    // UTF-16 Encoding
    if (code <= 0xFFFF) return String.fromCharCode(code);
    return String.fromCharCode(((code - 0x10000) >> 10) + 0xD800,
                               ((code - 0x10000) & 1023) + 0xDC00);
  }

  function readString(quote) {
    var out = "", chunkStart = ++tokPos;
    for (;;) {
      if (tokPos >= inputLen) raise(tokStart, "Unterminated string constant");
      var ch = input.charCodeAt(tokPos);
      if (ch === quote) break;
      if (ch === 92) { // '\'
        out += input.slice(chunkStart, tokPos);
        out += readEscapedChar();
        chunkStart = tokPos;
      } else {
        if (isNewLine(ch)) raise(tokStart, "Unterminated string constant");
        ++tokPos;
      }
    }
    out += input.slice(chunkStart, tokPos++);
    return finishToken(_string, out);
  }

  // Reads template string tokens.

  function readTmplToken() {
    var out = "", chunkStart = tokPos;
    for (;;) {
      if (tokPos >= inputLen) raise(tokStart, "Unterminated template");
      var ch = input.charCodeAt(tokPos);
      if (ch === 96 || ch === 36 && input.charCodeAt(tokPos + 1) === 123) { // '`', '${'
        if (tokPos === tokStart && tokType === _template) {
          if (ch === 36) {
            tokPos += 2;
            return finishToken(_dollarBraceL);
          } else {
            ++tokPos;
            return finishToken(_backQuote);
          }
        }
        out += input.slice(chunkStart, tokPos);
        return finishToken(_template, out);
      }
      if (ch === 92) { // '\'
        out += input.slice(chunkStart, tokPos);
        out += readEscapedChar();
        chunkStart = tokPos;
      } else if (isNewLine(ch)) {
        out += input.slice(chunkStart, tokPos);
        ++tokPos;
        if (ch === 13 && input.charCodeAt(tokPos) === 10) {
          ++tokPos;
          out += "\n";
        } else {
          out += String.fromCharCode(ch);
        }
        if (options.locations) {
          ++tokCurLine;
          tokLineStart = tokPos;
        }
        chunkStart = tokPos;
      } else {
        ++tokPos;
      }
    }
  }

  // Used to read escaped characters

  function readEscapedChar() {
    var ch = input.charCodeAt(++tokPos);
    var octal = /^[0-7]+/.exec(input.slice(tokPos, tokPos + 3));
    if (octal) octal = octal[0];
    while (octal && parseInt(octal, 8) > 255) octal = octal.slice(0, -1);
    if (octal === "0") octal = null;
    ++tokPos;
    if (octal) {
      if (strict) raise(tokPos - 2, "Octal literal in strict mode");
      tokPos += octal.length - 1;
      return String.fromCharCode(parseInt(octal, 8));
    } else {
      switch (ch) {
        case 110: return "\n"; // 'n' -> '\n'
        case 114: return "\r"; // 'r' -> '\r'
        case 120: return String.fromCharCode(readHexChar(2)); // 'x'
        case 117: return codePointToString(readCodePoint()); // 'u'
        case 116: return "\t"; // 't' -> '\t'
        case 98: return "\b"; // 'b' -> '\b'
        case 118: return "\u000b"; // 'v' -> '\u000b'
        case 102: return "\f"; // 'f' -> '\f'
        case 48: return "\0"; // 0 -> '\0'
        case 13: if (input.charCodeAt(tokPos) === 10) ++tokPos; // '\r\n'
        case 10: // ' \n'
          if (options.locations) { tokLineStart = tokPos; ++tokCurLine; }
          return "";
        default: return String.fromCharCode(ch);
      }
    }
  }

  // Used to read character escape sequences ('\x', '\u', '\U').

  function readHexChar(len) {
    var n = readInt(16, len);
    if (n === null) raise(tokStart, "Bad character escape sequence");
    return n;
  }

  // Used to signal to callers of `readWord1` whether the word
  // contained any escape sequences. This is needed because words with
  // escape sequences must not be interpreted as keywords.

  var containsEsc;

  // Read an identifier, and return it as a string. Sets `containsEsc`
  // to whether the word contained a '\u' escape.
  //
  // Incrementally adds only escaped chars, adding other chunks as-is
  // as a micro-optimization.

  function readWord1() {
    containsEsc = false;
    var word = "", first = true, chunkStart = tokPos;
    var astral = options.ecmaVersion >= 6;
    while (tokPos < inputLen) {
      var ch = fullCharCodeAtPos();
      if (isIdentifierChar(ch, astral)) {
        skipChar(ch);
      } else if (ch === 92) { // "\"
        containsEsc = true;
        word += input.slice(chunkStart, tokPos);
        var escStart = tokPos;
        if (input.charCodeAt(++tokPos) != 117) // "u"
          raise(tokPos, "Expecting Unicode escape sequence \\uXXXX");
        ++tokPos;
        var esc = readCodePoint();
        if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral))
          raise(escStart, "Invalid Unicode escape");
        word += codePointToString(esc);
        chunkStart = tokPos;
      } else {
        break;
      }
      first = false;
    }
    return word + input.slice(chunkStart, tokPos);
  }

  // Read an identifier or keyword token. Will check for reserved
  // words when necessary.

  function readWord() {
    var word = readWord1();
    var type = _name;
    if ((options.ecmaVersion >= 6 || !containsEsc) && isKeyword(word))
      type = keywordTypes[word];
    return finishToken(type, word);
  }

  // ## Parser

  // A recursive descent parser operates by defining functions for all
  // syntactic elements, and recursively calling those, each function
  // advancing the input stream and returning an AST node. Precedence
  // of constructs (for example, the fact that `!x[1]` means `!(x[1])`
  // instead of `(!x)[1]` is handled by the fact that the parser
  // function that parses unary prefix operators is called first, and
  // in turn calls the function that parses `[]` subscripts — that
  // way, it'll receive the node for `x[1]` already parsed, and wraps
  // *that* in the unary operator node.
  //
  // Acorn uses an [operator precedence parser][opp] to handle binary
  // operator precedence, because it is much more compact than using
  // the technique outlined above, which uses different, nesting
  // functions to specify precedence, for all of the ten binary
  // precedence levels that JavaScript defines.
  //
  // [opp]: http://en.wikipedia.org/wiki/Operator-precedence_parser

  // ### Parser utilities

  // Continue to the next token.

  function next() {
    if (options.onToken)
      options.onToken(new Token());

    lastStart = tokStart;
    lastEnd = tokEnd;
    lastEndLoc = tokEndLoc;
    readToken();
  }

  // Enter strict mode. Re-reads the next number or string to
  // please pedantic tests ("use strict"; 010; -- should fail).

  function setStrict(strct) {
    strict = strct;
    if (tokType !== _num && tokType !== _string) return;
    tokPos = tokStart;
    if (options.locations) {
      while (tokPos < tokLineStart) {
        tokLineStart = input.lastIndexOf("\n", tokLineStart - 2) + 1;
        --tokCurLine;
      }
    }
    skipSpace();
    readToken();
  }

  // Start an AST node, attaching a start offset.

  function Node() {
    this.type = null;
    this.start = tokStart;
    this.end = null;
  }

  exports.Node = Node;

  function SourceLocation() {
    this.start = tokStartLoc;
    this.end = null;
    if (sourceFile !== null) this.source = sourceFile;
  }

  function startNode() {
    var node = new Node();
    if (options.locations)
      node.loc = new SourceLocation();
    if (options.directSourceFile)
      node.sourceFile = options.directSourceFile;
    if (options.ranges)
      node.range = [tokStart, 0];
    return node;
  }

  // Sometimes, a node is only started *after* the token stream passed
  // its start position. The functions below help storing a position
  // and creating a node from a previous position.

  function storeCurrentPos() {
    return options.locations ? [tokStart, tokStartLoc] : tokStart;
  }

  function startNodeAt(pos) {
    var node = new Node(), start = pos;
    if (options.locations) {
      node.loc = new SourceLocation();
      node.loc.start = start[1];
      start = pos[0];
    }
    node.start = start;
    if (options.directSourceFile)
      node.sourceFile = options.directSourceFile;
    if (options.ranges)
      node.range = [start, 0];

    return node;
  }

  // Finish an AST node, adding `type` and `end` properties.

  function finishNode(node, type) {
    node.type = type;
    node.end = lastEnd;
    if (options.locations)
      node.loc.end = lastEndLoc;
    if (options.ranges)
      node.range[1] = lastEnd;
    return node;
  }

  // Finish node at given position

  function finishNodeAt(node, type, pos) {
    if (options.locations) { node.loc.end = pos[1]; pos = pos[0]; }
    node.type = type;
    node.end = pos;
    if (options.ranges)
      node.range[1] = pos;
    return node;
  }

  // Test whether a statement node is the string literal `"use strict"`.

  function isUseStrict(stmt) {
    return options.ecmaVersion >= 5 && stmt.type === "ExpressionStatement" &&
      stmt.expression.type === "Literal" && stmt.expression.value === "use strict";
  }

  // Predicate that tests whether the next token is of the given
  // type, and if yes, consumes it as a side effect.

  function eat(type) {
    if (tokType === type) {
      next();
      return true;
    } else {
      return false;
    }
  }

  // Tests whether parsed token is a contextual keyword.

  function isContextual(name) {
    return tokType === _name && tokVal === name;
  }

  // Consumes contextual keyword if possible.

  function eatContextual(name) {
    return tokVal === name && eat(_name);
  }

  // Asserts that following token is given contextual keyword.

  function expectContextual(name) {
    if (!eatContextual(name)) unexpected();
  }

  // Test whether a semicolon can be inserted at the current position.

  function canInsertSemicolon() {
    return !options.strictSemicolons &&
      (tokType === _eof || tokType === _braceR || newline.test(input.slice(lastEnd, tokStart)));
  }

  // Consume a semicolon, or, failing that, see if we are allowed to
  // pretend that there is a semicolon at this position.

  function semicolon() {
    if (!eat(_semi) && !canInsertSemicolon()) unexpected();
  }

  // Expect a token of a given type. If found, consume it, otherwise,
  // raise an unexpected token error.

  function expect(type) {
    eat(type) || unexpected();
  }

  // Raise an unexpected token error.

  function unexpected(pos) {
    raise(pos != null ? pos : tokStart, "Unexpected token");
  }

  // Checks if hash object has a property.

  function has(obj, propName) {
    return Object.prototype.hasOwnProperty.call(obj, propName);
  }

  // Convert existing expression atom to assignable pattern
  // if possible.

  function toAssignable(node, isBinding) {
    if (options.ecmaVersion >= 6 && node) {
      switch (node.type) {
        case "Identifier":
        case "ObjectPattern":
        case "ArrayPattern":
        case "AssignmentPattern":
          break;

        case "ObjectExpression":
          node.type = "ObjectPattern";
          for (var i = 0; i < node.properties.length; i++) {
            var prop = node.properties[i];
            if (prop.kind !== "init") raise(prop.key.start, "Object pattern can't contain getter or setter");
            toAssignable(prop.value, isBinding);
          }
          break;

        case "ArrayExpression":
          node.type = "ArrayPattern";
          toAssignableList(node.elements, isBinding);
          break;

        case "AssignmentExpression":
          if (node.operator === "=") {
            node.type = "AssignmentPattern";
          } else {
            raise(node.left.end, "Only '=' operator can be used for specifying default value.");
          }
          break;

        case "MemberExpression":
          if (!isBinding) break;

        default:
          raise(node.start, "Assigning to rvalue");
      }
    }
    return node;
  }

  // Convert list of expression atoms to binding list.

  function toAssignableList(exprList, isBinding) {
    if (exprList.length) {
      for (var i = 0; i < exprList.length - 1; i++) {
        toAssignable(exprList[i], isBinding);
      }
      var last = exprList[exprList.length - 1];
      switch (last.type) {
        case "RestElement":
          break;
        case "SpreadElement":
          last.type = "RestElement";
          var arg = last.argument;
          toAssignable(arg, isBinding);
          if (arg.type !== "Identifier" && arg.type !== "MemberExpression" && arg.type !== "ArrayPattern")
            unexpected(arg.start);
          break;
        default:
          toAssignable(last, isBinding);
      }
    }
    return exprList;
  }

  // Parses spread element.

  function parseSpread(refShorthandDefaultPos) {
    var node = startNode();
    next();
    node.argument = parseMaybeAssign(refShorthandDefaultPos);
    return finishNode(node, "SpreadElement");
  }

  function parseRest() {
    var node = startNode();
    next();
    node.argument = tokType === _name || tokType === _bracketL ? parseBindingAtom() : unexpected();
    return finishNode(node, "RestElement");
  }

  // Parses lvalue (assignable) atom.

  function parseBindingAtom() {
    if (options.ecmaVersion < 6) return parseIdent();
    switch (tokType) {
      case _name:
        return parseIdent();

      case _bracketL:
        var node = startNode();
        next();
        node.elements = parseBindingList(_bracketR, true);
        return finishNode(node, "ArrayPattern");

      case _braceL:
        return parseObj(true);

      default:
        unexpected();
    }
  }

  function parseBindingList(close, allowEmpty) {
    var elts = [], first = true;
    while (!eat(close)) {
      first ? first = false : expect(_comma);
      if (tokType === _ellipsis) {
        elts.push(parseRest());
        expect(close);
        break;
      }
      elts.push(allowEmpty && tokType === _comma ? null : parseMaybeDefault());
    }
    return elts;
  }

  // Parses assignment pattern around given atom if possible.

  function parseMaybeDefault(startPos, left) {
    startPos = startPos || storeCurrentPos();
    left = left || parseBindingAtom();
    if (!eat(_eq)) return left;
    var node = startNodeAt(startPos);
    node.operator = "=";
    node.left = left;
    node.right = parseMaybeAssign();
    return finishNode(node, "AssignmentPattern");
  }

  // Verify that argument names are not repeated, and it does not
  // try to bind the words `eval` or `arguments`.

  function checkFunctionParam(param, nameHash) {
    switch (param.type) {
      case "Identifier":
        if (isStrictReservedWord(param.name) || isStrictBadIdWord(param.name))
          raise(param.start, "Defining '" + param.name + "' in strict mode");
        if (has(nameHash, param.name))
          raise(param.start, "Argument name clash in strict mode");
        nameHash[param.name] = true;
        break;

      case "ObjectPattern":
        for (var i = 0; i < param.properties.length; i++)
          checkFunctionParam(param.properties[i].value, nameHash);
        break;

      case "ArrayPattern":
        for (var i = 0; i < param.elements.length; i++) {
          var elem = param.elements[i];
          if (elem) checkFunctionParam(elem, nameHash);
        }
        break;

      case "RestElement":
        return checkFunctionParam(param.argument, nameHash);
    }
  }

  // Check if property name clashes with already added.
  // Object/class getters and setters are not allowed to clash —
  // either with each other or with an init property — and in
  // strict mode, init properties are also not allowed to be repeated.

  function checkPropClash(prop, propHash) {
    if (options.ecmaVersion >= 6) return;
    var key = prop.key, name;
    switch (key.type) {
      case "Identifier": name = key.name; break;
      case "Literal": name = String(key.value); break;
      default: return;
    }
    var kind = prop.kind || "init", other;
    if (has(propHash, name)) {
      other = propHash[name];
      var isGetSet = kind !== "init";
      if ((strict || isGetSet) && other[kind] || !(isGetSet ^ other.init))
        raise(key.start, "Redefinition of property");
    } else {
      other = propHash[name] = {
        init: false,
        get: false,
        set: false
      };
    }
    other[kind] = true;
  }

  // Verify that a node is an lval — something that can be assigned
  // to.

  function checkLVal(expr, isBinding) {
    switch (expr.type) {
      case "Identifier":
        if (strict && (isStrictBadIdWord(expr.name) || isStrictReservedWord(expr.name)))
          raise(expr.start, (isBinding ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
        break;

      case "MemberExpression":
        if (isBinding) raise(expr.start, "Binding to member expression");
        break;

      case "ObjectPattern":
        for (var i = 0; i < expr.properties.length; i++)
          checkLVal(expr.properties[i].value, isBinding);
        break;

      case "ArrayPattern":
        for (var i = 0; i < expr.elements.length; i++) {
          var elem = expr.elements[i];
          if (elem) checkLVal(elem, isBinding);
        }
        break;

      case "AssignmentPattern":
        checkLVal(expr.left);
        break;

      case "RestElement":
        checkLVal(expr.argument);
        break;

      default:
        raise(expr.start, "Assigning to rvalue");
    }
  }

  // ### Statement parsing

  // Parse a program. Initializes the parser, reads any number of
  // statements, and wraps them in a Program node.  Optionally takes a
  // `program` argument.  If present, the statements will be appended
  // to its body instead of creating a new node.

  function parseTopLevel(node) {
    var first = true;
    if (!node.body) node.body = [];
    while (tokType !== _eof) {
      var stmt = parseStatement(true, true);
      node.body.push(stmt);
      if (first && isUseStrict(stmt)) setStrict(true);
      first = false;
    }

    next();
    return finishNode(node, "Program");
  }

  var loopLabel = {kind: "loop"}, switchLabel = {kind: "switch"};

  // Parse a single statement.
  //
  // If expecting a statement and finding a slash operator, parse a
  // regular expression literal. This is to handle cases like
  // `if (foo) /blah/.exec(foo);`, where looking at the previous token
  // does not help.

  function parseStatement(declaration, topLevel) {
    var starttype = tokType, node = startNode();

    // Most types of statements are recognized by the keyword they
    // start with. Many are trivial to parse, some require a bit of
    // complexity.

    switch (starttype) {
    case _break: case _continue: return parseBreakContinueStatement(node, starttype.keyword);
    case _debugger: return parseDebuggerStatement(node);
    case _do: return parseDoStatement(node);
    case _for: return parseForStatement(node);
    case _function:
      if (!declaration && options.ecmaVersion >= 6) unexpected();
      return parseFunctionStatement(node);
    case _class:
      if (!declaration) unexpected();
      return parseClass(node, true);
    case _if: return parseIfStatement(node);
    case _return: return parseReturnStatement(node);
    case _switch: return parseSwitchStatement(node);
    case _throw: return parseThrowStatement(node);
    case _try: return parseTryStatement(node);
    case _let: case _const: if (!declaration) unexpected(); // NOTE: falls through to _var
    case _var: return parseVarStatement(node, starttype.keyword);
    case _while: return parseWhileStatement(node);
    case _with: return parseWithStatement(node);
    case _braceL: return parseBlock(); // no point creating a function for this
    case _semi: return parseEmptyStatement(node);
    case _export:
    case _import:
      if (!topLevel && !options.allowImportExportEverywhere)
        raise(tokStart, "'import' and 'export' may only appear at the top level");
      return starttype === _import ? parseImport(node) : parseExport(node);

      // If the statement does not start with a statement keyword or a
      // brace, it's an ExpressionStatement or LabeledStatement. We
      // simply start parsing an expression, and afterwards, if the
      // next token is a colon and the expression was a simple
      // Identifier node, we switch to interpreting it as a label.
    default:
      var maybeName = tokVal, expr = parseExpression();
      if (starttype === _name && expr.type === "Identifier" && eat(_colon))
        return parseLabeledStatement(node, maybeName, expr);
      else return parseExpressionStatement(node, expr);
    }
  }

  function parseBreakContinueStatement(node, keyword) {
    var isBreak = keyword == "break";
    next();
    if (eat(_semi) || canInsertSemicolon()) node.label = null;
    else if (tokType !== _name) unexpected();
    else {
      node.label = parseIdent();
      semicolon();
    }

    // Verify that there is an actual destination to break or
    // continue to.
    for (var i = 0; i < labels.length; ++i) {
      var lab = labels[i];
      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) break;
        if (node.label && isBreak) break;
      }
    }
    if (i === labels.length) raise(node.start, "Unsyntactic " + keyword);
    return finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
  }

  function parseDebuggerStatement(node) {
    next();
    semicolon();
    return finishNode(node, "DebuggerStatement");
  }

  function parseDoStatement(node) {
    next();
    labels.push(loopLabel);
    node.body = parseStatement(false);
    labels.pop();
    expect(_while);
    node.test = parseParenExpression();
    if (options.ecmaVersion >= 6)
      eat(_semi);
    else
      semicolon();
    return finishNode(node, "DoWhileStatement");
  }

  // Disambiguating between a `for` and a `for`/`in` or `for`/`of`
  // loop is non-trivial. Basically, we have to parse the init `var`
  // statement or expression, disallowing the `in` operator (see
  // the second parameter to `parseExpression`), and then check
  // whether the next token is `in` or `of`. When there is no init
  // part (semicolon immediately after the opening parenthesis), it
  // is a regular `for` loop.

  function parseForStatement(node) {
    next();
    labels.push(loopLabel);
    expect(_parenL);
    if (tokType === _semi) return parseFor(node, null);
    if (tokType === _var || tokType === _let) {
      var init = startNode(), varKind = tokType.keyword, isLet = tokType === _let;
      next();
      parseVar(init, true, varKind);
      finishNode(init, "VariableDeclaration");
      if ((tokType === _in || (options.ecmaVersion >= 6 && isContextual("of"))) && init.declarations.length === 1 &&
          !(isLet && init.declarations[0].init))
        return parseForIn(node, init);
      return parseFor(node, init);
    }
    var refShorthandDefaultPos = {start: 0};
    var init = parseExpression(true, refShorthandDefaultPos);
    if (tokType === _in || (options.ecmaVersion >= 6 && isContextual("of"))) {
      toAssignable(init);
      checkLVal(init);
      return parseForIn(node, init);
    } else if (refShorthandDefaultPos.start) {
      unexpected(refShorthandDefaultPos.start);
    }
    return parseFor(node, init);
  }

  function parseFunctionStatement(node) {
    next();
    return parseFunction(node, true);
  }

  function parseIfStatement(node) {
    next();
    node.test = parseParenExpression();
    node.consequent = parseStatement(false);
    node.alternate = eat(_else) ? parseStatement(false) : null;
    return finishNode(node, "IfStatement");
  }

  function parseReturnStatement(node) {
    if (!inFunction && !options.allowReturnOutsideFunction)
      raise(tokStart, "'return' outside of function");
    next();

    // In `return` (and `break`/`continue`), the keywords with
    // optional arguments, we eagerly look for a semicolon or the
    // possibility to insert one.

    if (eat(_semi) || canInsertSemicolon()) node.argument = null;
    else { node.argument = parseExpression(); semicolon(); }
    return finishNode(node, "ReturnStatement");
  }

  function parseSwitchStatement(node) {
    next();
    node.discriminant = parseParenExpression();
    node.cases = [];
    expect(_braceL);
    labels.push(switchLabel);

    // Statements under must be grouped (by label) in SwitchCase
    // nodes. `cur` is used to keep the node that we are currently
    // adding statements to.

    for (var cur, sawDefault; tokType != _braceR;) {
      if (tokType === _case || tokType === _default) {
        var isCase = tokType === _case;
        if (cur) finishNode(cur, "SwitchCase");
        node.cases.push(cur = startNode());
        cur.consequent = [];
        next();
        if (isCase) cur.test = parseExpression();
        else {
          if (sawDefault) raise(lastStart, "Multiple default clauses"); sawDefault = true;
          cur.test = null;
        }
        expect(_colon);
      } else {
        if (!cur) unexpected();
        cur.consequent.push(parseStatement(true));
      }
    }
    if (cur) finishNode(cur, "SwitchCase");
    next(); // Closing brace
    labels.pop();
    return finishNode(node, "SwitchStatement");
  }

  function parseThrowStatement(node) {
    next();
    if (newline.test(input.slice(lastEnd, tokStart)))
      raise(lastEnd, "Illegal newline after throw");
    node.argument = parseExpression();
    semicolon();
    return finishNode(node, "ThrowStatement");
  }

  function parseTryStatement(node) {
    next();
    node.block = parseBlock();
    node.handler = null;
    if (tokType === _catch) {
      var clause = startNode();
      next();
      expect(_parenL);
      clause.param = parseBindingAtom();
      checkLVal(clause.param, true);
      expect(_parenR);
      clause.guard = null;
      clause.body = parseBlock();
      node.handler = finishNode(clause, "CatchClause");
    }
    node.guardedHandlers = empty;
    node.finalizer = eat(_finally) ? parseBlock() : null;
    if (!node.handler && !node.finalizer)
      raise(node.start, "Missing catch or finally clause");
    return finishNode(node, "TryStatement");
  }

  function parseVarStatement(node, kind) {
    next();
    parseVar(node, false, kind);
    semicolon();
    return finishNode(node, "VariableDeclaration");
  }

  function parseWhileStatement(node) {
    next();
    node.test = parseParenExpression();
    labels.push(loopLabel);
    node.body = parseStatement(false);
    labels.pop();
    return finishNode(node, "WhileStatement");
  }

  function parseWithStatement(node) {
    if (strict) raise(tokStart, "'with' in strict mode");
    next();
    node.object = parseParenExpression();
    node.body = parseStatement(false);
    return finishNode(node, "WithStatement");
  }

  function parseEmptyStatement(node) {
    next();
    return finishNode(node, "EmptyStatement");
  }

  function parseLabeledStatement(node, maybeName, expr) {
    for (var i = 0; i < labels.length; ++i)
      if (labels[i].name === maybeName) raise(expr.start, "Label '" + maybeName + "' is already declared");
    var kind = tokType.isLoop ? "loop" : tokType === _switch ? "switch" : null;
    labels.push({name: maybeName, kind: kind});
    node.body = parseStatement(true);
    labels.pop();
    node.label = expr;
    return finishNode(node, "LabeledStatement");
  }

  function parseExpressionStatement(node, expr) {
    node.expression = expr;
    semicolon();
    return finishNode(node, "ExpressionStatement");
  }

  // Used for constructs like `switch` and `if` that insist on
  // parentheses around their expression.

  function parseParenExpression() {
    expect(_parenL);
    var val = parseExpression();
    expect(_parenR);
    return val;
  }

  // Parse a semicolon-enclosed block of statements, handling `"use
  // strict"` declarations when `allowStrict` is true (used for
  // function bodies).

  function parseBlock(allowStrict) {
    var node = startNode(), first = true, oldStrict;
    node.body = [];
    expect(_braceL);
    while (!eat(_braceR)) {
      var stmt = parseStatement(true);
      node.body.push(stmt);
      if (first && allowStrict && isUseStrict(stmt)) {
        oldStrict = strict;
        setStrict(strict = true);
      }
      first = false;
    }
    if (oldStrict === false) setStrict(false);
    return finishNode(node, "BlockStatement");
  }

  // Parse a regular `for` loop. The disambiguation code in
  // `parseStatement` will already have parsed the init statement or
  // expression.

  function parseFor(node, init) {
    node.init = init;
    expect(_semi);
    node.test = tokType === _semi ? null : parseExpression();
    expect(_semi);
    node.update = tokType === _parenR ? null : parseExpression();
    expect(_parenR);
    node.body = parseStatement(false);
    labels.pop();
    return finishNode(node, "ForStatement");
  }

  // Parse a `for`/`in` and `for`/`of` loop, which are almost
  // same from parser's perspective.

  function parseForIn(node, init) {
    var type = tokType === _in ? "ForInStatement" : "ForOfStatement";
    next();
    node.left = init;
    node.right = parseExpression();
    expect(_parenR);
    node.body = parseStatement(false);
    labels.pop();
    return finishNode(node, type);
  }

  // Parse a list of variable declarations.

  function parseVar(node, noIn, kind) {
    node.declarations = [];
    node.kind = kind;
    for (;;) {
      var decl = startNode();
      decl.id = parseBindingAtom();
      checkLVal(decl.id, true);
      decl.init = eat(_eq) ? parseMaybeAssign(noIn) : (kind === _const.keyword ? unexpected() : null);
      node.declarations.push(finishNode(decl, "VariableDeclarator"));
      if (!eat(_comma)) break;
    }
    return node;
  }

  // ### Expression parsing

  // These nest, from the most general expression type at the top to
  // 'atomic', nondivisible expression types at the bottom. Most of
  // the functions will simply let the function(s) below them parse,
  // and, *if* the syntactic construct they handle is present, wrap
  // the AST node that the inner parser gave them in another node.

  // Parse a full expression. The optional arguments are used to
  // forbid the `in` operator (in for loops initalization expressions)
  // and provide reference for storing '=' operator inside shorthand
  // property assignment in contexts where both object expression
  // and object pattern might appear (so it's possible to raise
  // delayed syntax error at correct position).

  function parseExpression(noIn, refShorthandDefaultPos) {
    var start = storeCurrentPos();
    var expr = parseMaybeAssign(noIn, refShorthandDefaultPos);
    if (tokType === _comma) {
      var node = startNodeAt(start);
      node.expressions = [expr];
      while (eat(_comma)) node.expressions.push(parseMaybeAssign(noIn, refShorthandDefaultPos));
      return finishNode(node, "SequenceExpression");
    }
    return expr;
  }

  // Parse an assignment expression. This includes applications of
  // operators like `+=`.

  function parseMaybeAssign(noIn, refShorthandDefaultPos) {
    var failOnShorthandAssign;
    if (!refShorthandDefaultPos) {
      refShorthandDefaultPos = {start: 0};
      failOnShorthandAssign = true;
    } else {
      failOnShorthandAssign = false;
    }
    var start = storeCurrentPos();
    var left = parseMaybeConditional(noIn, refShorthandDefaultPos);
    if (tokType.isAssign) {
      var node = startNodeAt(start);
      node.operator = tokVal;
      node.left = tokType === _eq ? toAssignable(left) : left;
      refShorthandDefaultPos.start = 0; // reset because shorthand default was used correctly
      checkLVal(left);
      next();
      node.right = parseMaybeAssign(noIn);
      return finishNode(node, "AssignmentExpression");
    } else if (failOnShorthandAssign && refShorthandDefaultPos.start) {
      unexpected(refShorthandDefaultPos.start);
    }
    return left;
  }

  // Parse a ternary conditional (`?:`) operator.

  function parseMaybeConditional(noIn, refShorthandDefaultPos) {
    var start = storeCurrentPos();
    var expr = parseExprOps(noIn, refShorthandDefaultPos);
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;
    if (eat(_question)) {
      var node = startNodeAt(start);
      node.test = expr;
      node.consequent = parseMaybeAssign();
      expect(_colon);
      node.alternate = parseMaybeAssign(noIn);
      return finishNode(node, "ConditionalExpression");
    }
    return expr;
  }

  // Start the precedence parser.

  function parseExprOps(noIn, refShorthandDefaultPos) {
    var start = storeCurrentPos();
    var expr = parseMaybeUnary(refShorthandDefaultPos);
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;
    return parseExprOp(expr, start, -1, noIn);
  }

  // Parse binary operators with the operator precedence parsing
  // algorithm. `left` is the left-hand side of the operator.
  // `minPrec` provides context that allows the function to stop and
  // defer further parser to one of its callers when it encounters an
  // operator that has a lower precedence than the set it is parsing.

  function parseExprOp(left, leftStart, minPrec, noIn) {
    var prec = tokType.binop;
    if (prec != null && (!noIn || tokType !== _in)) {
      if (prec > minPrec) {
        var node = startNodeAt(leftStart);
        node.left = left;
        node.operator = tokVal;
        var op = tokType;
        next();
        var start = storeCurrentPos();
        node.right = parseExprOp(parseMaybeUnary(), start, prec, noIn);
        finishNode(node, (op === _logicalOR || op === _logicalAND) ? "LogicalExpression" : "BinaryExpression");
        return parseExprOp(node, leftStart, minPrec, noIn);
      }
    }
    return left;
  }

  // Parse unary operators, both prefix and postfix.

  function parseMaybeUnary(refShorthandDefaultPos) {
    if (tokType.prefix) {
      var node = startNode(), update = tokType.isUpdate;
      node.operator = tokVal;
      node.prefix = true;
      next();
      node.argument = parseMaybeUnary();
      if (refShorthandDefaultPos && refShorthandDefaultPos.start) unexpected(refShorthandDefaultPos.start);
      if (update) checkLVal(node.argument);
      else if (strict && node.operator === "delete" &&
               node.argument.type === "Identifier")
        raise(node.start, "Deleting local variable in strict mode");
      return finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    }
    var start = storeCurrentPos();
    var expr = parseExprSubscripts(refShorthandDefaultPos);
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;
    while (tokType.postfix && !canInsertSemicolon()) {
      var node = startNodeAt(start);
      node.operator = tokVal;
      node.prefix = false;
      node.argument = expr;
      checkLVal(expr);
      next();
      expr = finishNode(node, "UpdateExpression");
    }
    return expr;
  }

  // Parse call, dot, and `[]`-subscript expressions.

  function parseExprSubscripts(refShorthandDefaultPos) {
    var start = storeCurrentPos();
    var expr = parseExprAtom(refShorthandDefaultPos);
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;
    return parseSubscripts(expr, start);
  }

  function parseSubscripts(base, start, noCalls) {
    if (eat(_dot)) {
      var node = startNodeAt(start);
      node.object = base;
      node.property = parseIdent(true);
      node.computed = false;
      return parseSubscripts(finishNode(node, "MemberExpression"), start, noCalls);
    } else if (eat(_bracketL)) {
      var node = startNodeAt(start);
      node.object = base;
      node.property = parseExpression();
      node.computed = true;
      expect(_bracketR);
      return parseSubscripts(finishNode(node, "MemberExpression"), start, noCalls);
    } else if (!noCalls && eat(_parenL)) {
      var node = startNodeAt(start);
      node.callee = base;
      node.arguments = parseExprList(_parenR, false);
      return parseSubscripts(finishNode(node, "CallExpression"), start, noCalls);
    } else if (tokType === _backQuote) {
      var node = startNodeAt(start);
      node.tag = base;
      node.quasi = parseTemplate();
      return parseSubscripts(finishNode(node, "TaggedTemplateExpression"), start, noCalls);
    } return base;
  }

  // Parse an atomic expression — either a single token that is an
  // expression, an expression started by a keyword like `function` or
  // `new`, or an expression wrapped in punctuation like `()`, `[]`,
  // or `{}`.

  function parseExprAtom(refShorthandDefaultPos) {
    switch (tokType) {
    case _this:
      var node = startNode();
      next();
      return finishNode(node, "ThisExpression");

    case _yield:
      if (inGenerator) return parseYield();

    case _name:
      var start = storeCurrentPos();
      var id = parseIdent(tokType !== _name);
      if (!canInsertSemicolon() && eat(_arrow)) {
        return parseArrowExpression(startNodeAt(start), [id]);
      }
      return id;

    case _regexp:
      var node = startNode();
      node.regex = {pattern: tokVal.pattern, flags: tokVal.flags};
      node.value = tokVal.value;
      node.raw = input.slice(tokStart, tokEnd);
      next();
      return finishNode(node, "Literal");

    case _num: case _string:
      var node = startNode();
      node.value = tokVal;
      node.raw = input.slice(tokStart, tokEnd);
      next();
      return finishNode(node, "Literal");

    case _null: case _true: case _false:
      var node = startNode();
      node.value = tokType.atomValue;
      node.raw = tokType.keyword;
      next();
      return finishNode(node, "Literal");

    case _parenL:
      return parseParenAndDistinguishExpression();

    case _bracketL:
      var node = startNode();
      next();
      // check whether this is array comprehension or regular array
      if (options.ecmaVersion >= 7 && tokType === _for) {
        return parseComprehension(node, false);
      }
      node.elements = parseExprList(_bracketR, true, true, refShorthandDefaultPos);
      return finishNode(node, "ArrayExpression");

    case _braceL:
      return parseObj(false, refShorthandDefaultPos);

    case _function:
      var node = startNode();
      next();
      return parseFunction(node, false);

    case _class:
      return parseClass(startNode(), false);

    case _new:
      return parseNew();

    case _backQuote:
      return parseTemplate();

    default:
      unexpected();
    }
  }

  function parseParenAndDistinguishExpression() {
    var start = storeCurrentPos(), val;
    if (options.ecmaVersion >= 6) {
      next();

      if (options.ecmaVersion >= 7 && tokType === _for) {
        return parseComprehension(startNodeAt(start), true);
      }

      var innerStart = storeCurrentPos(), exprList = [], first = true;
      var refShorthandDefaultPos = {start: 0}, spreadStart, innerParenStart;
      while (tokType !== _parenR) {
        first ? first = false : expect(_comma);
        if (tokType === _ellipsis) {
          spreadStart = tokStart;
          exprList.push(parseRest());
          break;
        } else {
          if (tokType === _parenL && !innerParenStart) {
            innerParenStart = tokStart;
          }
          exprList.push(parseMaybeAssign(false, refShorthandDefaultPos));
        }
      }
      var innerEnd = storeCurrentPos();
      expect(_parenR);

      if (!canInsertSemicolon() && eat(_arrow)) {
        if (innerParenStart) unexpected(innerParenStart);
        return parseArrowExpression(startNodeAt(start), exprList);
      }

      if (!exprList.length) unexpected(lastStart);
      if (spreadStart) unexpected(spreadStart);
      if (refShorthandDefaultPos.start) unexpected(refShorthandDefaultPos.start);

      if (exprList.length > 1) {
        val = startNodeAt(innerStart);
        val.expressions = exprList;
        finishNodeAt(val, "SequenceExpression", innerEnd);
      } else {
        val = exprList[0];
      }
    } else {
      val = parseParenExpression();
    }

    if (options.preserveParens) {
      var par = startNodeAt(start);
      par.expression = val;
      return finishNode(par, "ParenthesizedExpression");
    } else {
      return val;
    }
  }

  // New's precedence is slightly tricky. It must allow its argument
  // to be a `[]` or dot subscript expression, but not a call — at
  // least, not without wrapping it in parentheses. Thus, it uses the

  function parseNew() {
    var node = startNode();
    next();
    var start = storeCurrentPos();
    node.callee = parseSubscripts(parseExprAtom(), start, true);
    if (eat(_parenL)) node.arguments = parseExprList(_parenR, false);
    else node.arguments = empty;
    return finishNode(node, "NewExpression");
  }

  // Parse template expression.

  function parseTemplateElement() {
    var elem = startNode();
    elem.value = {
      raw: input.slice(tokStart, tokEnd),
      cooked: tokVal
    };
    next();
    elem.tail = tokType === _backQuote;
    return finishNode(elem, "TemplateElement");
  }

  function parseTemplate() {
    var node = startNode();
    next();
    node.expressions = [];
    var curElt = parseTemplateElement();
    node.quasis = [curElt];
    while (!curElt.tail) {
      expect(_dollarBraceL);
      node.expressions.push(parseExpression());
      expect(_braceR);
      node.quasis.push(curElt = parseTemplateElement());
    }
    next();
    return finishNode(node, "TemplateLiteral");
  }

  // Parse an object literal or binding pattern.

  function parseObj(isPattern, refShorthandDefaultPos) {
    var node = startNode(), first = true, propHash = {};
    node.properties = [];
    next();
    while (!eat(_braceR)) {
      if (!first) {
        expect(_comma);
        if (options.allowTrailingCommas && eat(_braceR)) break;
      } else first = false;

      var prop = startNode(), isGenerator, start;
      if (options.ecmaVersion >= 6) {
        prop.method = false;
        prop.shorthand = false;
        if (isPattern || refShorthandDefaultPos) {
          start = storeCurrentPos();
        }
        if (!isPattern) {
          isGenerator = eat(_star);
        }
      }
      parsePropertyName(prop);
      if (eat(_colon)) {
        prop.value = isPattern ? parseMaybeDefault() : parseMaybeAssign(false, refShorthandDefaultPos);
        prop.kind = "init";
      } else if (options.ecmaVersion >= 6 && tokType === _parenL) {
        if (isPattern) unexpected();
        prop.kind = "init";
        prop.method = true;
        prop.value = parseMethod(isGenerator);
      } else if (options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" &&
                 (prop.key.name === "get" || prop.key.name === "set") &&
                 (tokType != _comma && tokType != _braceR)) {
        if (isGenerator || isPattern) unexpected();
        prop.kind = prop.key.name;
        parsePropertyName(prop);
        prop.value = parseMethod(false);
      } else if (options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
        prop.kind = "init";
        if (isPattern) {
          prop.value = parseMaybeDefault(start, prop.key);
        } else if (tokType === _eq && refShorthandDefaultPos) {
          if (!refShorthandDefaultPos.start)
            refShorthandDefaultPos.start = tokStart;
          prop.value = parseMaybeDefault(start, prop.key);
        } else {
          prop.value = prop.key;
        }
        prop.shorthand = true;
      } else unexpected();

      checkPropClash(prop, propHash);
      node.properties.push(finishNode(prop, "Property"));
    }
    return finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
  }

  function parsePropertyName(prop) {
    if (options.ecmaVersion >= 6) {
      if (eat(_bracketL)) {
        prop.computed = true;
        prop.key = parseExpression();
        expect(_bracketR);
        return;
      } else {
        prop.computed = false;
      }
    }
    prop.key = (tokType === _num || tokType === _string) ? parseExprAtom() : parseIdent(true);
  }

  // Initialize empty function node.

  function initFunction(node) {
    node.id = null;
    if (options.ecmaVersion >= 6) {
      node.generator = false;
      node.expression = false;
    }
  }

  // Parse a function declaration or literal (depending on the
  // `isStatement` parameter).

  function parseFunction(node, isStatement, allowExpressionBody) {
    initFunction(node);
    if (options.ecmaVersion >= 6) {
      node.generator = eat(_star);
    }
    if (isStatement || tokType === _name) {
      node.id = parseIdent();
    }
    expect(_parenL);
    node.params = parseBindingList(_parenR, false);
    parseFunctionBody(node, allowExpressionBody);
    return finishNode(node, isStatement ? "FunctionDeclaration" : "FunctionExpression");
  }

  // Parse object or class method.

  function parseMethod(isGenerator) {
    var node = startNode();
    initFunction(node);
    expect(_parenL);
    node.params = parseBindingList(_parenR, false);
    var allowExpressionBody;
    if (options.ecmaVersion >= 6) {
      node.generator = isGenerator;
      allowExpressionBody = true;
    } else {
      allowExpressionBody = false;
    }
    parseFunctionBody(node, allowExpressionBody);
    return finishNode(node, "FunctionExpression");
  }

  // Parse arrow function expression with given parameters.

  function parseArrowExpression(node, params) {
    initFunction(node);
    node.params = toAssignableList(params, true);
    parseFunctionBody(node, true);
    return finishNode(node, "ArrowFunctionExpression");
  }

  // Parse function body and check parameters.

  function parseFunctionBody(node, allowExpression) {
    var isExpression = allowExpression && tokType !== _braceL;

    if (isExpression) {
      node.body = parseMaybeAssign();
      node.expression = true;
    } else {
      // Start a new scope with regard to labels and the `inFunction`
      // flag (restore them to their old value afterwards).
      var oldInFunc = inFunction, oldInGen = inGenerator, oldLabels = labels;
      inFunction = true; inGenerator = node.generator; labels = [];
      node.body = parseBlock(true);
      node.expression = false;
      inFunction = oldInFunc; inGenerator = oldInGen; labels = oldLabels;
    }

    // If this is a strict mode function, verify that argument names
    // are not repeated, and it does not try to bind the words `eval`
    // or `arguments`.
    if (strict || !isExpression && node.body.body.length && isUseStrict(node.body.body[0])) {
      var nameHash = {};
      if (node.id)
        checkFunctionParam(node.id, {});
      for (var i = 0; i < node.params.length; i++)
        checkFunctionParam(node.params[i], nameHash);
    }
  }

  // Parse a class declaration or literal (depending on the
  // `isStatement` parameter).

  function parseClass(node, isStatement) {
    next();
    node.id = tokType === _name ? parseIdent() : isStatement ? unexpected() : null;
    node.superClass = eat(_extends) ? parseExprSubscripts() : null;
    var classBody = startNode();
    classBody.body = [];
    expect(_braceL);
    while (!eat(_braceR)) {
      if (eat(_semi)) continue;
      var method = startNode();
      var isGenerator = eat(_star);
      parsePropertyName(method);
      if (tokType !== _parenL && !method.computed && method.key.type === "Identifier" &&
          method.key.name === "static") {
        if (isGenerator) unexpected();
        method['static'] = true;
        isGenerator = eat(_star);
        parsePropertyName(method);
      } else {
        method['static'] = false;
      }
      if (tokType !== _parenL && !method.computed && method.key.type === "Identifier" &&
          (method.key.name === "get" || method.key.name === "set")) {
        if (isGenerator) unexpected();
        method.kind = method.key.name;
        parsePropertyName(method);
      } else {
        method.kind = "";
      }
      method.value = parseMethod(isGenerator);
      classBody.body.push(finishNode(method, "MethodDefinition"));
    }
    node.body = finishNode(classBody, "ClassBody");
    return finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
  }

  // Parses a comma-separated list of expressions, and returns them as
  // an array. `close` is the token type that ends the list, and
  // `allowEmpty` can be turned on to allow subsequent commas with
  // nothing in between them to be parsed as `null` (which is needed
  // for array literals).

  function parseExprList(close, allowTrailingComma, allowEmpty, refShorthandDefaultPos) {
    var elts = [], first = true;
    while (!eat(close)) {
      if (!first) {
        expect(_comma);
        if (allowTrailingComma && options.allowTrailingCommas && eat(close)) break;
      } else first = false;

      if (allowEmpty && tokType === _comma) {
        elts.push(null);
      } else {
        if (tokType === _ellipsis)
          elts.push(parseSpread(refShorthandDefaultPos));
        else
          elts.push(parseMaybeAssign(false, refShorthandDefaultPos));
      }
    }
    return elts;
  }

  // Parse the next token as an identifier. If `liberal` is true (used
  // when parsing properties), it will also convert keywords into
  // identifiers.

  function parseIdent(liberal) {
    var node = startNode();
    if (liberal && options.forbidReserved == "everywhere") liberal = false;
    if (tokType === _name) {
      if (!liberal &&
          (options.forbidReserved &&
           (options.ecmaVersion === 3 ? isReservedWord3 : isReservedWord5)(tokVal) ||
           strict && isStrictReservedWord(tokVal)) &&
          input.slice(tokStart, tokEnd).indexOf("\\") == -1)
        raise(tokStart, "The keyword '" + tokVal + "' is reserved");
      node.name = tokVal;
    } else if (liberal && tokType.keyword) {
      node.name = tokType.keyword;
    } else {
      unexpected();
    }
    next();
    return finishNode(node, "Identifier");
  }

  // Parses module export declaration.

  function parseExport(node) {
    next();
    // export var|const|let|function|class ...;
    if (tokType === _var || tokType === _const || tokType === _let || tokType === _function || tokType === _class) {
      node.declaration = parseStatement(true);
      node['default'] = false;
      node.specifiers = null;
      node.source = null;
    } else
    // export default ...;
    if (eat(_default)) {
      var expr = parseMaybeAssign();
      if (expr.id) {
        switch (expr.type) {
          case "FunctionExpression": expr.type = "FunctionDeclaration"; break;
          case "ClassExpression": expr.type = "ClassDeclaration"; break;
        }
      }
      node.declaration = expr;
      node['default'] = true;
      node.specifiers = null;
      node.source = null;
      semicolon();
    } else {
      // export * from '...';
      // export { x, y as z } [from '...'];
      var isBatch = tokType === _star;
      node.declaration = null;
      node['default'] = false;
      node.specifiers = parseExportSpecifiers();
      if (eatContextual("from")) {
        node.source = tokType === _string ? parseExprAtom() : unexpected();
      } else {
        if (isBatch) unexpected();
        node.source = null;
      }
      semicolon();
    }
    return finishNode(node, "ExportDeclaration");
  }

  // Parses a comma-separated list of module exports.

  function parseExportSpecifiers() {
    var nodes = [], first = true;
    if (tokType === _star) {
      // export * from '...'
      var node = startNode();
      next();
      nodes.push(finishNode(node, "ExportBatchSpecifier"));
    } else {
      // export { x, y as z } [from '...']
      expect(_braceL);
      while (!eat(_braceR)) {
        if (!first) {
          expect(_comma);
          if (options.allowTrailingCommas && eat(_braceR)) break;
        } else first = false;

        var node = startNode();
        node.id = parseIdent(tokType === _default);
        node.name = eatContextual("as") ? parseIdent(true) : null;
        nodes.push(finishNode(node, "ExportSpecifier"));
      }
    }
    return nodes;
  }

  // Parses import declaration.

  function parseImport(node) {
    next();
    // import '...';
    if (tokType === _string) {
      node.specifiers = [];
      node.source = parseExprAtom();
      node.kind = "";
    } else {
      node.specifiers = parseImportSpecifiers();
      expectContextual("from");
      node.source = tokType === _string ? parseExprAtom() : unexpected();
    }
    semicolon();
    return finishNode(node, "ImportDeclaration");
  }

  // Parses a comma-separated list of module imports.

  function parseImportSpecifiers() {
    var nodes = [], first = true;
    if (tokType === _name) {
      // import defaultObj, { x, y as z } from '...'
      var node = startNode();
      node.id = parseIdent();
      checkLVal(node.id, true);
      node.name = null;
      node['default'] = true;
      nodes.push(finishNode(node, "ImportSpecifier"));
      if (!eat(_comma)) return nodes;
    }
    if (tokType === _star) {
      var node = startNode();
      next();
      expectContextual("as");
      node.name = parseIdent();
      checkLVal(node.name, true);
      nodes.push(finishNode(node, "ImportBatchSpecifier"));
      return nodes;
    }
    expect(_braceL);
    while (!eat(_braceR)) {
      if (!first) {
        expect(_comma);
        if (options.allowTrailingCommas && eat(_braceR)) break;
      } else first = false;

      var node = startNode();
      node.id = parseIdent(true);
      node.name = eatContextual("as") ? parseIdent() : null;
      checkLVal(node.name || node.id, true);
      node['default'] = false;
      nodes.push(finishNode(node, "ImportSpecifier"));
    }
    return nodes;
  }

  // Parses yield expression inside generator.

  function parseYield() {
    var node = startNode();
    next();
    if (eat(_semi) || canInsertSemicolon()) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = eat(_star);
      node.argument = parseMaybeAssign();
    }
    return finishNode(node, "YieldExpression");
  }

  // Parses array and generator comprehensions.

  function parseComprehension(node, isGenerator) {
    node.blocks = [];
    while (tokType === _for) {
      var block = startNode();
      next();
      expect(_parenL);
      block.left = parseBindingAtom();
      checkLVal(block.left, true);
      expectContextual("of");
      block.right = parseExpression();
      expect(_parenR);
      node.blocks.push(finishNode(block, "ComprehensionBlock"));
    }
    node.filter = eat(_if) ? parseParenExpression() : null;
    node.body = parseExpression();
    expect(isGenerator ? _parenR : _bracketR);
    node.generator = isGenerator;
    return finishNode(node, "ComprehensionExpression");
  }
});

//#endregion


//#region acorn/acorn_loose.js

// Acorn: Loose parser
//
// This module provides an alternative parser (`parse_dammit`) that
// exposes that same interface as `parse`, but will try to parse
// anything as JavaScript, repairing syntax error the best it can.
// There are circumstances in which it will raise an error and give
// up, but they are very rare. The resulting AST will be a mostly
// valid JavaScript AST (as per the [Mozilla parser API][api], except
// that:
//
// - Return outside functions is allowed
//
// - Label consistency (no conflicts, break only to existing labels)
//   is not enforced.
//
// - Bogus Identifier nodes with a name of `"✖"` are inserted whenever
//   the parser got too confused to return anything meaningful.
//
// [api]: https://developer.mozilla.org/en-US/docs/SpiderMonkey/Parser_API
//
// The expected use for this is to *first* try `acorn.parse`, and only
// if that fails switch to `parse_dammit`. The loose parser might
// parse badly indented code incorrectly, so **don't** use it as
// your default parser.
//
// Quite a lot of acorn.js is duplicated here. The alternative was to
// add a *lot* of extra cruft to that file, making it less readable
// and slower. Copying and editing the code allowed me to make
// invasive changes and simplifications without creating a complicated
// tangle.

(function(root, mod) {
  if (typeof exports == "object" && typeof module == "object") return mod(exports, require("./acorn")); // CommonJS
  if (typeof define == "function" && define.amd) return define(["exports", "./acorn"], mod); // AMD
  mod(root.acorn || (root.acorn = {}), root.acorn); // Plain browser env
})(this, function(exports, acorn) {
  "use strict";

  var tt = acorn.tokTypes;

  var options, input, fetchToken, context;

  acorn.defaultOptions.tabSize = 4;

  exports.parse_dammit = function(inpt, opts) {
    if (!opts) opts = {};
    input = String(inpt);
    fetchToken = acorn.tokenize(input, opts);
    options = fetchToken.options;
    sourceFile = options.sourceFile || null;
    context = [];
    nextLineStart = 0;
    ahead.length = 0;
    next();
    return parseTopLevel();
  };

  var lastEnd, token = {start: 0, end: 0}, ahead = [];
  var curLineStart, nextLineStart, curIndent, lastEndLoc, sourceFile;

  function next() {
    lastEnd = token.end;
    if (options.locations)
      lastEndLoc = token.loc && token.loc.end;

    token = ahead.shift() || readToken();
    if (options.onToken)
      options.onToken(token);

    if (token.start >= nextLineStart) {
      while (token.start >= nextLineStart) {
        curLineStart = nextLineStart;
        nextLineStart = lineEnd(curLineStart) + 1;
      }
      curIndent = indentationAfter(curLineStart);
    }
  }

  function readToken() {
    for (;;) {
      try {
        var tok = fetchToken();
        if (tok.type === tt.dot && input.substr(tok.end, 1) === '.' && options.ecmaVersion >= 6) {
          tok = fetchToken();
          tok.start--;
          tok.type = tt.ellipsis;
        }
        return tok;
      } catch(e) {
        if (!(e instanceof SyntaxError)) throw e;

        // Try to skip some text, based on the error message, and then continue
        var msg = e.message, pos = e.raisedAt, replace = true;
        if (/unterminated/i.test(msg)) {
          pos = lineEnd(e.pos + 1);
          if (/string/.test(msg)) {
            replace = {start: e.pos, end: pos, type: tt.string, value: input.slice(e.pos + 1, pos)};
          } else if (/regular expr/i.test(msg)) {
            var re = input.slice(e.pos, pos);
            try { re = new RegExp(re); } catch(e) {}
            replace = {start: e.pos, end: pos, type: tt.regexp, value: re};
          } else if (/template/.test(msg)) {
            replace = {start: e.pos, end: pos,
                       type: tt.template,
                       value: input.slice(e.pos, pos)};
          } else if (/comment/.test(msg)) {
            replace = fetchToken.current();
          } else {
            replace = false;
          }
        } else if (/invalid (unicode|regexp|number)|expecting unicode|octal literal|is reserved|directly after number/i.test(msg)) {
          while (pos < input.length && !isSpace(input.charCodeAt(pos))) ++pos;
        } else if (/character escape|expected hexadecimal/i.test(msg)) {
          while (pos < input.length) {
            var ch = input.charCodeAt(pos++);
            if (ch === 34 || ch === 39 || isNewline(ch)) break;
          }
        } else if (/unexpected character/i.test(msg)) {
          pos++;
          replace = false;
        } else if (/regular expression/i.test(msg)) {
          replace = true;
        } else {
          throw e;
        }
        resetTo(pos);
        if (replace === true) replace = {start: pos, end: pos, type: tt.name, value: "✖"};
        if (replace) {
          if (options.locations) {
            replace.loc = new SourceLocation(acorn.getLineInfo(input, replace.start));
            replace.loc.end = acorn.getLineInfo(input, replace.end);
          }
          return replace;
        }
      }
    }
  }

  function resetTo(pos) {
    for (;;) {
      try {
        var ch = input.charAt(pos - 1);
        var reAllowed = !ch || /[\[\{\(,;:?\/*=+\-~!|&%^<>]/.test(ch) ||
          /[enwfd]/.test(ch) && /\b(keywords|case|else|return|throw|new|in|(instance|type)of|delete|void)$/.test(input.slice(pos - 10, pos));
        return fetchToken.jumpTo(pos, reAllowed);
      } catch(e) {
        if (!(e instanceof SyntaxError && /unterminated comment/i.test(e.message))) throw e;
        pos = lineEnd(e.pos + 1);
        if (pos >= input.length) return;
      }
    }
  }

  function lookAhead(n) {
    while (n > ahead.length)
      ahead.push(readToken());
    return ahead[n-1];
  }

  var newline = /[\n\r\u2028\u2029]/;

  function isNewline(ch) {
    return ch === 10 || ch === 13 || ch === 8232 || ch === 8329;
  }
  function isSpace(ch) {
    return (ch < 14 && ch > 8) || ch === 32 || ch === 160 || isNewline(ch);
  }

  function pushCx() {
    context.push(curIndent);
  }
  function popCx() {
    curIndent = context.pop();
  }

  function lineEnd(pos) {
    while (pos < input.length && !isNewline(input.charCodeAt(pos))) ++pos;
    return pos;
  }
  function indentationAfter(pos) {
    for (var count = 0;; ++pos) {
      var ch = input.charCodeAt(pos);
      if (ch === 32) ++count;
      else if (ch === 9) count += options.tabSize;
      else return count;
    }
  }

  function closes(closeTok, indent, line, blockHeuristic) {
    if (token.type === closeTok || token.type === tt.eof) return true;
    if (line != curLineStart && curIndent < indent && tokenStartsLine() &&
        (!blockHeuristic || nextLineStart >= input.length ||
         indentationAfter(nextLineStart) < indent)) return true;
    return false;
  }

  function tokenStartsLine() {
    for (var p = token.start - 1; p >= curLineStart; --p) {
      var ch = input.charCodeAt(p);
      if (ch !== 9 && ch !== 32) return false;
    }
    return true;
  }

  function Node(start) {
    this.type = null;
    this.start = start;
    this.end = null;
  }
  Node.prototype = acorn.Node.prototype;

  function SourceLocation(start) {
    this.start = start || token.loc.start || {line: 1, column: 0};
    this.end = null;
    if (sourceFile !== null) this.source = sourceFile;
  }

  function startNode() {
    var node = new Node(token.start);
    if (options.locations)
      node.loc = new SourceLocation();
    if (options.directSourceFile)
      node.sourceFile = options.directSourceFile;
    if (options.ranges)
      node.range = [token.start, 0];
    return node;
  }

  function storeCurrentPos() {
    return options.locations ? [token.start, token.loc.start] : token.start;
  }

  function startNodeAt(pos) {
    var node;
    if (options.locations) {
      node = new Node(pos[0]);
      node.loc = new SourceLocation(pos[1]);
      pos = pos[0];
    } else {
      node = new Node(pos);
    }
    if (options.directSourceFile)
      node.sourceFile = options.directSourceFile;
    if (options.ranges)
      node.range = [pos, 0];
    return node;
  }

  function finishNode(node, type) {
    node.type = type;
    node.end = lastEnd;
    if (options.locations)
      node.loc.end = lastEndLoc;
    if (options.ranges)
      node.range[1] = lastEnd;
    return node;
  }

  function dummyIdent() {
    var dummy = startNode();
    dummy.name = "✖";
    return finishNode(dummy, "Identifier");
  }
  function isDummy(node) { return node.name == "✖"; }

  function eat(type) {
    if (token.type === type) {
      next();
      return true;
    } else {
      return false;
    }
  }

  function isContextual(name) {
    return token.type === tt.name && token.value === name;
  }

  function eatContextual(name) {
    return token.value === name && eat(tt.name);
  }

  function canInsertSemicolon() {
    return (token.type === tt.eof || token.type === tt.braceR || newline.test(input.slice(lastEnd, token.start)));
  }

  function semicolon() {
    return eat(tt.semi);
  }

  function expect(type) {
    if (eat(type)) return true;
    if (lookAhead(1).type == type) {
      next(); next();
      return true;
    }
    if (lookAhead(2).type == type) {
      next(); next(); next();
      return true;
    }
  }

  function checkLVal(expr) {
    if (!expr) return expr;
    switch (expr.type) {
      case "Identifier":
      case "MemberExpression":
      case "ObjectPattern":
      case "ArrayPattern":
      case "RestElement":
      case "AssignmentPattern":
        return expr;

      default:
        return dummyIdent();
    }
  }

  function parseTopLevel() {
    var node = startNodeAt(options.locations ? [0, acorn.getLineInfo(input, 0)] : 0);
    node.body = [];
    while (token.type !== tt.eof) node.body.push(parseStatement());
    lastEnd = token.end;
    lastEndLoc = token.loc && token.loc.end;
    return finishNode(node, "Program");
  }

  function parseStatement() {
    var starttype = token.type, node = startNode();

    switch (starttype) {
    case tt._break: case tt._continue:
      next();
      var isBreak = starttype === tt._break;
      if (semicolon() || canInsertSemicolon()) {
        node.label = null;
      } else {
        node.label = token.type === tt.name ? parseIdent() : null;
        semicolon();
      }
      return finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");

    case tt._debugger:
      next();
      semicolon();
      return finishNode(node, "DebuggerStatement");

    case tt._do:
      next();
      node.body = parseStatement();
      node.test = eat(tt._while) ? parseParenExpression() : dummyIdent();
      semicolon();
      return finishNode(node, "DoWhileStatement");

    case tt._for:
      next();
      pushCx();
      expect(tt.parenL);
      if (token.type === tt.semi) return parseFor(node, null);
      if (token.type === tt._var || token.type === tt._let) {
        var init = parseVar(true);
        if (init.declarations.length === 1 && (token.type === tt._in || isContextual("of"))) {
          return parseForIn(node, init);
        }
        return parseFor(node, init);
      }
      var init = parseExpression(true);
      if (token.type === tt._in || isContextual("of")) {
        return parseForIn(node, toAssignable(init));
      }
      return parseFor(node, init);

    case tt._function:
      next();
      return parseFunction(node, true);

    case tt._if:
      next();
      node.test = parseParenExpression();
      node.consequent = parseStatement();
      node.alternate = eat(tt._else) ? parseStatement() : null;
      return finishNode(node, "IfStatement");

    case tt._return:
      next();
      if (eat(tt.semi) || canInsertSemicolon()) node.argument = null;
      else { node.argument = parseExpression(); semicolon(); }
      return finishNode(node, "ReturnStatement");

    case tt._switch:
      var blockIndent = curIndent, line = curLineStart;
      next();
      node.discriminant = parseParenExpression();
      node.cases = [];
      pushCx();
      expect(tt.braceL);

      for (var cur; !closes(tt.braceR, blockIndent, line, true);) {
        if (token.type === tt._case || token.type === tt._default) {
          var isCase = token.type === tt._case;
          if (cur) finishNode(cur, "SwitchCase");
          node.cases.push(cur = startNode());
          cur.consequent = [];
          next();
          if (isCase) cur.test = parseExpression();
          else cur.test = null;
          expect(tt.colon);
        } else {
          if (!cur) {
            node.cases.push(cur = startNode());
            cur.consequent = [];
            cur.test = null;
          }
          cur.consequent.push(parseStatement());
        }
      }
      if (cur) finishNode(cur, "SwitchCase");
      popCx();
      eat(tt.braceR);
      return finishNode(node, "SwitchStatement");

    case tt._throw:
      next();
      node.argument = parseExpression();
      semicolon();
      return finishNode(node, "ThrowStatement");

    case tt._try:
      next();
      node.block = parseBlock();
      node.handler = null;
      if (token.type === tt._catch) {
        var clause = startNode();
        next();
        expect(tt.parenL);
        clause.param = toAssignable(parseExprAtom());
        expect(tt.parenR);
        clause.guard = null;
        clause.body = parseBlock();
        node.handler = finishNode(clause, "CatchClause");
      }
      node.finalizer = eat(tt._finally) ? parseBlock() : null;
      if (!node.handler && !node.finalizer) return node.block;
      return finishNode(node, "TryStatement");

    case tt._var:
    case tt._let:
    case tt._const:
      return parseVar();

    case tt._while:
      next();
      node.test = parseParenExpression();
      node.body = parseStatement();
      return finishNode(node, "WhileStatement");

    case tt._with:
      next();
      node.object = parseParenExpression();
      node.body = parseStatement();
      return finishNode(node, "WithStatement");

    case tt.braceL:
      return parseBlock();

    case tt.semi:
      next();
      return finishNode(node, "EmptyStatement");

    case tt._class:
      return parseObj(true, true);

    case tt._import:
      return parseImport();

    case tt._export:
      return parseExport();

    default:
      var expr = parseExpression();
      if (isDummy(expr)) {
        next();
        if (token.type === tt.eof) return finishNode(node, "EmptyStatement");
        return parseStatement();
      } else if (starttype === tt.name && expr.type === "Identifier" && eat(tt.colon)) {
        node.body = parseStatement();
        node.label = expr;
        return finishNode(node, "LabeledStatement");
      } else {
        node.expression = expr;
        semicolon();
        return finishNode(node, "ExpressionStatement");
      }
    }
  }

  function parseBlock() {
    var node = startNode();
    pushCx();
    expect(tt.braceL);
    var blockIndent = curIndent, line = curLineStart;
    node.body = [];
    while (!closes(tt.braceR, blockIndent, line, true))
      node.body.push(parseStatement());
    popCx();
    eat(tt.braceR);
    return finishNode(node, "BlockStatement");
  }

  function parseFor(node, init) {
    node.init = init;
    node.test = node.update = null;
    if (eat(tt.semi) && token.type !== tt.semi) node.test = parseExpression();
    if (eat(tt.semi) && token.type !== tt.parenR) node.update = parseExpression();
    popCx();
    expect(tt.parenR);
    node.body = parseStatement();
    return finishNode(node, "ForStatement");
  }

  function parseForIn(node, init) {
    var type = token.type === tt._in ? "ForInStatement" : "ForOfStatement";
    next();
    node.left = init;
    node.right = parseExpression();
    popCx();
    expect(tt.parenR);
    node.body = parseStatement();
    return finishNode(node, type);
  }

  function parseVar(noIn) {
    var node = startNode();
    node.kind = token.type.keyword;
    next();
    node.declarations = [];
    do {
      var decl = startNode();
      decl.id = options.ecmaVersion >= 6 ? toAssignable(parseExprAtom()) : parseIdent();
      decl.init = eat(tt.eq) ? parseMaybeAssign(noIn) : null;
      node.declarations.push(finishNode(decl, "VariableDeclarator"));
    } while (eat(tt.comma));
    if (!node.declarations.length) {
      var decl = startNode();
      decl.id = dummyIdent();
      node.declarations.push(finishNode(decl, "VariableDeclarator"));
    }
    if (!noIn) semicolon();
    return finishNode(node, "VariableDeclaration");
  }

  function parseExpression(noIn) {
    var start = storeCurrentPos();
    var expr = parseMaybeAssign(noIn);
    if (token.type === tt.comma) {
      var node = startNodeAt(start);
      node.expressions = [expr];
      while (eat(tt.comma)) node.expressions.push(parseMaybeAssign(noIn));
      return finishNode(node, "SequenceExpression");
    }
    return expr;
  }

  function parseParenExpression() {
    pushCx();
    expect(tt.parenL);
    var val = parseExpression();
    popCx();
    expect(tt.parenR);
    return val;
  }

  function parseMaybeAssign(noIn) {
    var start = storeCurrentPos();
    var left = parseMaybeConditional(noIn);
    if (token.type.isAssign) {
      var node = startNodeAt(start);
      node.operator = token.value;
      node.left = token.type === tt.eq ? toAssignable(left) : checkLVal(left);
      next();
      node.right = parseMaybeAssign(noIn);
      return finishNode(node, "AssignmentExpression");
    }
    return left;
  }

  function parseMaybeConditional(noIn) {
    var start = storeCurrentPos();
    var expr = parseExprOps(noIn);
    if (eat(tt.question)) {
      var node = startNodeAt(start);
      node.test = expr;
      node.consequent = parseMaybeAssign();
      node.alternate = expect(tt.colon) ? parseMaybeAssign(noIn) : dummyIdent();
      return finishNode(node, "ConditionalExpression");
    }
    return expr;
  }

  function parseExprOps(noIn) {
    var start = storeCurrentPos();
    var indent = curIndent, line = curLineStart;
    return parseExprOp(parseMaybeUnary(noIn), start, -1, noIn, indent, line);
  }

  function parseExprOp(left, start, minPrec, noIn, indent, line) {
    if (curLineStart != line && curIndent < indent && tokenStartsLine()) return left;
    var prec = token.type.binop;
    if (prec != null && (!noIn || token.type !== tt._in)) {
      if (prec > minPrec) {
        var node = startNodeAt(start);
        node.left = left;
        node.operator = token.value;
        next();
        if (curLineStart != line && curIndent < indent && tokenStartsLine()) {
          node.right = dummyIdent();
        } else {
          var rightStart = storeCurrentPos();
          node.right = parseExprOp(parseMaybeUnary(noIn), rightStart, prec, noIn, indent, line);
        }
        finishNode(node, /&&|\|\|/.test(node.operator) ? "LogicalExpression" : "BinaryExpression");
        return parseExprOp(node, start, minPrec, noIn, indent, line);
      }
    }
    return left;
  }

  function parseMaybeUnary(noIn) {
    if (token.type.prefix) {
      var node = startNode(), update = token.type.isUpdate;
      node.operator = token.value;
      node.prefix = true;
      next();
      node.argument = parseMaybeUnary(noIn);
      if (update) node.argument = checkLVal(node.argument);
      return finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    } else if (token.type === tt.ellipsis) {
      var node = startNode();
      next();
      node.argument = parseMaybeUnary(noIn);
      return finishNode(node, "SpreadElement");
    }
    var start = storeCurrentPos();
    var expr = parseExprSubscripts();
    while (token.type.postfix && !canInsertSemicolon()) {
      var node = startNodeAt(start);
      node.operator = token.value;
      node.prefix = false;
      node.argument = checkLVal(expr);
      next();
      expr = finishNode(node, "UpdateExpression");
    }
    return expr;
  }

  function parseExprSubscripts() {
    var start = storeCurrentPos();
    return parseSubscripts(parseExprAtom(), start, false, curIndent, curLineStart);
  }

  function parseSubscripts(base, start, noCalls, startIndent, line) {
    for (;;) {
      if (curLineStart != line && curIndent <= startIndent && tokenStartsLine()) {
        if (token.type == tt.dot && curIndent == startIndent)
          --startIndent;
        else
          return base;
      }

      if (eat(tt.dot)) {
        var node = startNodeAt(start);
        node.object = base;
        if (curLineStart != line && curIndent <= startIndent && tokenStartsLine())
          node.property = dummyIdent();
        else
          node.property = parsePropertyAccessor() || dummyIdent();
        node.computed = false;
        base = finishNode(node, "MemberExpression");
      } else if (token.type == tt.bracketL) {
        pushCx();
        next();
        var node = startNodeAt(start);
        node.object = base;
        node.property = parseExpression();
        node.computed = true;
        popCx();
        expect(tt.bracketR);
        base = finishNode(node, "MemberExpression");
      } else if (!noCalls && token.type == tt.parenL) {
        pushCx();
        var node = startNodeAt(start);
        node.callee = base;
        node.arguments = parseExprList(tt.parenR);
        base = finishNode(node, "CallExpression");
      } else if (token.type == tt.backQuote) {
        var node = startNodeAt(start);
        node.tag = base;
        node.quasi = parseTemplate();
        base = finishNode(node, "TaggedTemplateExpression");
      } else {
        return base;
      }
    }
  }

  function parseExprAtom() {
    switch (token.type) {
    case tt._this:
      var node = startNode();
      next();
      return finishNode(node, "ThisExpression");

    case tt.name:
      var start = storeCurrentPos();
      var id = parseIdent();
      return eat(tt.arrow) ? parseArrowExpression(startNodeAt(start), [id]) : id;

    case tt.regexp:
      var node = startNode();
      var val = token.value;
      node.regex = {pattern: val.pattern, flags: val.flags};
      node.value = val.value;
      node.raw = input.slice(token.start, token.end);
      next();
      return finishNode(node, "Literal");

    case tt.num: case tt.string:
      var node = startNode();
      node.value = token.value;
      node.raw = input.slice(token.start, token.end);
      next();
      return finishNode(node, "Literal");

    case tt._null: case tt._true: case tt._false:
      var node = startNode();
      node.value = token.type.atomValue;
      node.raw = token.type.keyword;
      next();
      return finishNode(node, "Literal");

    case tt.parenL:
      var start = storeCurrentPos();
      next();
      var val = parseExpression();
      expect(tt.parenR);
      if (eat(tt.arrow)) {
        return parseArrowExpression(startNodeAt(start), val.expressions || (isDummy(val) ? [] : [val]));
      }
      if (options.preserveParens) {
        var par = startNodeAt(start);
        par.expression = val;
        val = finishNode(par, "ParenthesizedExpression");
      }
      return val;

    case tt.bracketL:
      var node = startNode();
      pushCx();
      node.elements = parseExprList(tt.bracketR, true);
      return finishNode(node, "ArrayExpression");

    case tt.braceL:
      return parseObj();

    case tt._class:
      return parseObj(true);

    case tt._function:
      var node = startNode();
      next();
      return parseFunction(node, false);

    case tt._new:
      return parseNew();

    case tt._yield:
      var node = startNode();
      next();
      if (semicolon() || canInsertSemicolon()) {
        node.delegate = false;
        node.argument = null;
      } else {
        node.delegate = eat(tt.star);
        node.argument = parseMaybeAssign();
      }
      return finishNode(node, "YieldExpression");

    case tt.backQuote:
      return parseTemplate();

    default:
      return dummyIdent();
    }
  }

  function parseNew() {
    var node = startNode(), startIndent = curIndent, line = curLineStart;
    next();
    var start = storeCurrentPos();
    node.callee = parseSubscripts(parseExprAtom(), start, true, startIndent, line);
    if (token.type == tt.parenL) {
      pushCx();
      node.arguments = parseExprList(tt.parenR);
    } else {
      node.arguments = [];
    }
    return finishNode(node, "NewExpression");
  }

  function parseTemplateElement() {
    var elem = startNode();
    elem.value = {
      raw: input.slice(token.start, token.end),
      cooked: token.value
    };
    next();
    elem.tail = token.type === tt.backQuote;
    return finishNode(elem, "TemplateElement");
  }

  function parseTemplate() {
    var node = startNode();
    next();
    node.expressions = [];
    var curElt = parseTemplateElement();
    node.quasis = [curElt];
    while (!curElt.tail) {
      next();
      node.expressions.push(parseExpression());
      if (expect(tt.braceR)) {
        curElt = parseTemplateElement();
      } else {
        curElt = startNode();
        curElt.value = {cooked: '', raw: ''};
        curElt.tail = true;
      }
      node.quasis.push(curElt);
    }
    expect(tt.backQuote);
    return finishNode(node, "TemplateLiteral");
  }

  function parseObj(isClass, isStatement) {
    var node = startNode();
    if (isClass) {
      next();
      if (token.type === tt.name) node.id = parseIdent();
      else if (isStatement) node.id = dummyIdent();
      else node.id = null;
      node.superClass = eat(tt._extends) ? parseExpression() : null;
      node.body = startNode();
      node.body.body = [];
    } else {
      node.properties = [];
    }
    pushCx();
    var indent = curIndent + 1, line = curLineStart;
    eat(tt.braceL);
    if (curIndent + 1 < indent) { indent = curIndent; line = curLineStart; }
    while (!closes(tt.braceR, indent, line)) {
      if (isClass && semicolon()) continue;
      var prop = startNode(), isGenerator, start;
      if (options.ecmaVersion >= 6) {
        if (isClass) {
          prop['static'] = false;
        } else {
          start = storeCurrentPos();
          prop.method = false;
          prop.shorthand = false;
        }
        isGenerator = eat(tt.star);
      }
      parsePropertyName(prop);
      if (isDummy(prop.key)) { if (isDummy(parseMaybeAssign())) next(); eat(tt.comma); continue; }
      if (isClass) {
        if (prop.key.type === "Identifier" && !prop.computed && prop.key.name === "static" &&
            (token.type != tt.parenL && token.type != tt.braceL)) {
          prop['static'] = true;
          isGenerator = eat(tt.star);
          parsePropertyName(prop);
        } else {
          prop['static'] = false;
        }
      }
      if (!isClass && eat(tt.colon)) {
        prop.kind = "init";
        prop.value = parseMaybeAssign();
      } else if (options.ecmaVersion >= 6 && (token.type === tt.parenL || token.type === tt.braceL)) {
        if (isClass) {
          prop.kind = "";
        } else {
          prop.kind = "init";
          prop.method = true;
        }
        prop.value = parseMethod(isGenerator);
      } else if (options.ecmaVersion >= 5 && prop.key.type === "Identifier" &&
                 !prop.computed && (prop.key.name === "get" || prop.key.name === "set") &&
                 (token.type != tt.comma && token.type != tt.braceR)) {
        prop.kind = prop.key.name;
        parsePropertyName(prop);
        prop.value = parseMethod(false);
      } else if (isClass) {
        prop.kind = "";
        prop.value = parseMethod(isGenerator);
      } else {
        prop.kind = "init";
        if (options.ecmaVersion >= 6) {
          if (eat(tt.eq)) {
            var assign = startNodeAt(start);
            assign.operator = "=";
            assign.left = prop.key;
            assign.right = parseMaybeAssign();
            prop.value = finishNode(assign, "AssignmentExpression");
          } else {
            prop.value = prop.key;
          }
        } else {
          prop.value = dummyIdent();
        }
        prop.shorthand = true;
      }

      if (isClass) {
        node.body.body.push(finishNode(prop, "MethodDefinition"));
      } else {
        node.properties.push(finishNode(prop, "Property"));
        eat(tt.comma);
      }
    }
    popCx();
    if (!eat(tt.braceR)) {
      // If there is no closing brace, make the node span to the start
      // of the next token (this is useful for Tern)
      lastEnd = token.start;
      if (options.locations) lastEndLoc = token.loc.start;
    }
    if (isClass) {
      semicolon();
      finishNode(node.body, "ClassBody");
      return finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
    } else {
      return finishNode(node, "ObjectExpression");
    }
  }

  function parsePropertyName(prop) {
    if (options.ecmaVersion >= 6) {
      if (eat(tt.bracketL)) {
        prop.computed = true;
        prop.key = parseExpression();
        expect(tt.bracketR);
        return;
      } else {
        prop.computed = false;
      }
    }
    var key = (token.type === tt.num || token.type === tt.string) ? parseExprAtom() : parseIdent();
    prop.key = key || dummyIdent();
  }

  function parsePropertyAccessor() {
    if (token.type === tt.name || token.type.keyword) return parseIdent();
  }

  function parseIdent() {
    var node = startNode();
    node.name = token.type === tt.name ? token.value : token.type.keyword;
    next();
    return finishNode(node, "Identifier");
  }

  function initFunction(node) {
    node.id = null;
    node.params = [];
    if (options.ecmaVersion >= 6) {
      node.generator = false;
      node.expression = false;
    }
  }

  // Convert existing expression atom to assignable pattern
  // if possible.

  function toAssignable(node) {
    if (options.ecmaVersion >= 6 && node) {
      switch (node.type) {
        case "ObjectExpression":
          node.type = "ObjectPattern";
          var props = node.properties;
          for (var i = 0; i < props.length; i++) {
            toAssignable(props[i].value);
          }
          break;

        case "ArrayExpression":
          node.type = "ArrayPattern";
          toAssignableList(node.elements);
          break;

        case "SpreadElement":
          node.type = "RestElement";
          node.argument = toAssignable(node.argument);
          break;

        case "AssignmentExpression":
          node.type = "AssignmentPattern";
          break;
      }
    }
    return checkLVal(node);
  }

  function toAssignableList(exprList) {
    for (var i = 0; i < exprList.length; i++) {
      toAssignable(exprList[i]);
    }
    return exprList;
  }

  function parseFunctionParams(params) {
    pushCx();
    params = parseExprList(tt.parenR);
    return toAssignableList(params);
  }

  function parseFunction(node, isStatement) {
    initFunction(node);
    if (options.ecmaVersion >= 6) {
      node.generator = eat(tt.star);
    }
    if (token.type === tt.name) node.id = parseIdent();
    else if (isStatement) node.id = dummyIdent();
    node.params = parseFunctionParams();
    node.body = parseBlock();
    return finishNode(node, isStatement ? "FunctionDeclaration" : "FunctionExpression");
  }

  function parseMethod(isGenerator) {
    var node = startNode();
    initFunction(node);
    node.params = parseFunctionParams();
    node.generator = isGenerator || false;
    node.expression = options.ecmaVersion >= 6 && token.type !== tt.braceL;
    node.body = node.expression ? parseMaybeAssign() : parseBlock();
    return finishNode(node, "FunctionExpression");
  }

  function parseArrowExpression(node, params) {
    initFunction(node);
    node.params = toAssignableList(params);
    node.expression = token.type !== tt.braceL;
    node.body = node.expression ? parseMaybeAssign() : parseBlock();
    return finishNode(node, "ArrowFunctionExpression");
  }

  function parseExport() {
    var node = startNode();
    next();
    node['default'] = eat(tt._default);
    node.specifiers = node.source = null;
    if (node['default']) {
      var expr = parseMaybeAssign();
      if (expr.id) {
        switch (expr.type) {
          case "FunctionExpression": expr.type = "FunctionDeclaration"; break;
          case "ClassExpression": expr.type = "ClassDeclaration"; break;
        }
      }
      node.declaration = expr;
      semicolon();
    } else if (token.type.keyword) {
      node.declaration = parseStatement();
    } else {
      node.declaration = null;
      parseSpecifierList(node, "Export");
    }
    semicolon();
    return finishNode(node, "ExportDeclaration");
  }

  function parseImport() {
    var node = startNode();
    next();
    if (token.type === tt.string) {
      node.specifiers = [];
      node.source = parseExprAtom();
      node.kind = '';
    } else {
      if (token.type === tt.name && token.value !== "from") {
        var elt = startNode();
        elt.id = parseIdent();
        elt.name = null;
        elt['default'] = true;
        finishNode(elt, "ImportSpecifier");
        eat(tt.comma);
      }
      parseSpecifierList(node, "Import");
      var specs = node.specifiers;
      for (var i = 0; i < specs.length; i++) specs[i]['default'] = false;
      if (elt) node.specifiers.unshift(elt);
    }
    semicolon();
    return finishNode(node, "ImportDeclaration");
  }

  function parseSpecifierList(node, prefix) {
    var elts = node.specifiers = [];
    if (token.type === tt.star) {
      var elt = startNode();
      next();
      if (eatContextual("as")) elt.name = parseIdent();
      elts.push(finishNode(elt, prefix + "BatchSpecifier"));
    } else {
      var indent = curIndent, line = curLineStart, continuedLine = nextLineStart;
      pushCx();
      eat(tt.braceL);
      if (curLineStart > continuedLine) continuedLine = curLineStart;
      while (!closes(tt.braceR, indent + (curLineStart <= continuedLine ? 1 : 0), line)) {
        var elt = startNode();
        if (eat(tt.star)) {
          if (eatContextual("as")) elt.name = parseIdent();
          finishNode(elt, prefix + "BatchSpecifier");
        } else {
          if (isContextual("from")) break;
          elt.id = parseIdent();
          elt.name = eatContextual("as") ? parseIdent() : null;
          finishNode(elt, prefix + "Specifier");
        }
        elts.push(elt);
        eat(tt.comma);
      }
      eat(tt.braceR);
      popCx();
    }
    node.source = eatContextual("from") ? parseExprAtom() : null;
  }

  function parseExprList(close, allowEmpty) {
    var indent = curIndent, line = curLineStart, elts = [];
    next(); // Opening bracket
    while (!closes(close, indent + 1, line)) {
      if (eat(tt.comma)) {
        elts.push(allowEmpty ? null : dummyIdent());
        continue;
      }
      var elt = parseMaybeAssign();
      if (isDummy(elt)) {
        if (closes(close, indent, line)) break;
        next();
      } else {
        elts.push(elt);
      }
      eat(tt.comma);
    }
    popCx();
    if (!eat(close)) {
      // If there is no closing brace, make the node span to the start
      // of the next token (this is useful for Tern)
      lastEnd = token.start;
      if (options.locations) lastEndLoc = token.loc.start;
    }
    return elts;
  }
});

//#endregion


//#region acorn/util/walk.js

// AST walker module for Mozilla Parser API compatible trees

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") return mod(exports); // CommonJS
  if (typeof define == "function" && define.amd) return define(["exports"], mod); // AMD
  mod((this.acorn || (this.acorn = {})).walk = {}); // Plain browser env
})(function(exports) {
  "use strict";

  // A simple walk is one where you simply specify callbacks to be
  // called on specific nodes. The last two arguments are optional. A
  // simple use would be
  //
  //     walk.simple(myTree, {
  //         Expression: function(node) { ... }
  //     });
  //
  // to do something with all expressions. All Parser API node types
  // can be used to identify node types, as well as Expression,
  // Statement, and ScopeBody, which denote categories of nodes.
  //
  // The base argument can be used to pass a custom (recursive)
  // walker, and state can be used to give this walked an initial
  // state.
  exports.simple = function(node, visitors, base, state) {
    if (!base) base = exports.base;
    function c(node, st, override) {
      var type = override || node.type, found = visitors[type];
      base[type](node, st, c);
      if (found) found(node, st);
    }
    c(node, state);
  };

  // An ancestor walk builds up an array of ancestor nodes (including
  // the current node) and passes them to the callback as the state parameter.
  exports.ancestor = function(node, visitors, base, state) {
    if (!base) base = exports.base;
    if (!state) state = [];
    function c(node, st, override) {
      var type = override || node.type, found = visitors[type];
      if (node != st[st.length - 1]) {
        st = st.slice();
        st.push(node);
      }
      base[type](node, st, c);
      if (found) found(node, st);
    }
    c(node, state);
  };

  // A recursive walk is one where your functions override the default
  // walkers. They can modify and replace the state parameter that's
  // threaded through the walk, and can opt how and whether to walk
  // their child nodes (by calling their third argument on these
  // nodes).
  exports.recursive = function(node, state, funcs, base) {
    var visitor = funcs ? exports.make(funcs, base) : base;
    function c(node, st, override) {
      visitor[override || node.type](node, st, c);
    }
    c(node, state);
  };

  function makeTest(test) {
    if (typeof test == "string")
      return function(type) { return type == test; };
    else if (!test)
      return function() { return true; };
    else
      return test;
  }

  function Found(node, state) { this.node = node; this.state = state; }

  // Find a node with a given start, end, and type (all are optional,
  // null can be used as wildcard). Returns a {node, state} object, or
  // undefined when it doesn't find a matching node.
  exports.findNodeAt = function(node, start, end, test, base, state) {
    test = makeTest(test);
    try {
      if (!base) base = exports.base;
      var c = function(node, st, override) {
        var type = override || node.type;
        if ((start == null || node.start <= start) &&
            (end == null || node.end >= end))
          base[type](node, st, c);
        if (test(type, node) &&
            (start == null || node.start == start) &&
            (end == null || node.end == end))
          throw new Found(node, st);
      };
      c(node, state);
    } catch (e) {
      if (e instanceof Found) return e;
      throw e;
    }
  };

  // Find the innermost node of a given type that contains the given
  // position. Interface similar to findNodeAt.
  exports.findNodeAround = function(node, pos, test, base, state) {
    test = makeTest(test);
    try {
      if (!base) base = exports.base;
      var c = function(node, st, override) {
        var type = override || node.type;
        if (node.start > pos || node.end < pos) return;
        base[type](node, st, c);
        if (test(type, node)) throw new Found(node, st);
      };
      c(node, state);
    } catch (e) {
      if (e instanceof Found) return e;
      throw e;
    }
  };

  // Find the outermost matching node after a given position.
  exports.findNodeAfter = function(node, pos, test, base, state) {
    test = makeTest(test);
    try {
      if (!base) base = exports.base;
      var c = function(node, st, override) {
        if (node.end < pos) return;
        var type = override || node.type;
        if (node.start >= pos && test(type, node)) throw new Found(node, st);
        base[type](node, st, c);
      };
      c(node, state);
    } catch (e) {
      if (e instanceof Found) return e;
      throw e;
    }
  };

  // Find the outermost matching node before a given position.
  exports.findNodeBefore = function(node, pos, test, base, state) {
    test = makeTest(test);
    if (!base) base = exports.base;
    var max;
    var c = function(node, st, override) {
      if (node.start > pos) return;
      var type = override || node.type;
      if (node.end <= pos && (!max || max.node.end < node.end) && test(type, node))
        max = new Found(node, st);
      base[type](node, st, c);
    };
    c(node, state);
    return max;
  };

  // Used to create a custom walker. Will fill in all missing node
  // type properties with the defaults.
  exports.make = function(funcs, base) {
    if (!base) base = exports.base;
    var visitor = {};
    for (var type in base) visitor[type] = base[type];
    for (var type in funcs) visitor[type] = funcs[type];
    return visitor;
  };

  function skipThrough(node, st, c) { c(node, st); }
  function ignore(_node, _st, _c) {}

  // Node walkers.

  var base = exports.base = {};
  base.Program = base.BlockStatement = function(node, st, c) {
    for (var i = 0; i < node.body.length; ++i)
      c(node.body[i], st, "Statement");
  };
  base.Statement = skipThrough;
  base.EmptyStatement = ignore;
  base.ExpressionStatement = base.ParenthesizedExpression = function(node, st, c) {
    c(node.expression, st, "Expression");
  };
  base.IfStatement = function(node, st, c) {
    c(node.test, st, "Expression");
    c(node.consequent, st, "Statement");
    if (node.alternate) c(node.alternate, st, "Statement");
  };
  base.LabeledStatement = function(node, st, c) {
    c(node.body, st, "Statement");
  };
  base.BreakStatement = base.ContinueStatement = ignore;
  base.WithStatement = function(node, st, c) {
    c(node.object, st, "Expression");
    c(node.body, st, "Statement");
  };
  base.SwitchStatement = function(node, st, c) {
    c(node.discriminant, st, "Expression");
    for (var i = 0; i < node.cases.length; ++i) {
      var cs = node.cases[i];
      if (cs.test) c(cs.test, st, "Expression");
      for (var j = 0; j < cs.consequent.length; ++j)
        c(cs.consequent[j], st, "Statement");
    }
  };
  base.ReturnStatement = base.YieldExpression = function(node, st, c) {
    if (node.argument) c(node.argument, st, "Expression");
  };
  base.ThrowStatement = base.SpreadElement = base.RestElement = function(node, st, c) {
    c(node.argument, st, "Expression");
  };
  base.TryStatement = function(node, st, c) {
    c(node.block, st, "Statement");
    if (node.handler) c(node.handler.body, st, "ScopeBody");
    if (node.finalizer) c(node.finalizer, st, "Statement");
  };
  base.WhileStatement = function(node, st, c) {
    c(node.test, st, "Expression");
    c(node.body, st, "Statement");
  };
  base.DoWhileStatement = base.WhileStatement;
  base.ForStatement = function(node, st, c) {
    if (node.init) c(node.init, st, "ForInit");
    if (node.test) c(node.test, st, "Expression");
    if (node.update) c(node.update, st, "Expression");
    c(node.body, st, "Statement");
  };
  base.ForInStatement = base.ForOfStatement = function(node, st, c) {
    c(node.left, st, "ForInit");
    c(node.right, st, "Expression");
    c(node.body, st, "Statement");
  };
  base.ForInit = function(node, st, c) {
    if (node.type == "VariableDeclaration") c(node, st);
    else c(node, st, "Expression");
  };
  base.DebuggerStatement = ignore;

  base.FunctionDeclaration = function(node, st, c) {
    c(node, st, "Function");
  };
  base.VariableDeclaration = function(node, st, c) {
    for (var i = 0; i < node.declarations.length; ++i) {
      var decl = node.declarations[i];
      if (decl.init) c(decl.init, st, "Expression");
    }
  };

  base.Function = function(node, st, c) {
    c(node.body, st, "ScopeBody");
  };
  base.ScopeBody = function(node, st, c) {
    c(node, st, "Statement");
  };

  base.Expression = skipThrough;
  base.ThisExpression = ignore;
  base.ArrayExpression = base.ArrayPattern =  function(node, st, c) {
    for (var i = 0; i < node.elements.length; ++i) {
      var elt = node.elements[i];
      if (elt) c(elt, st, "Expression");
    }
  };
  base.ObjectExpression = base.ObjectPattern = function(node, st, c) {
    for (var i = 0; i < node.properties.length; ++i)
      c(node.properties[i], st);
  };
  base.FunctionExpression = base.ArrowFunctionExpression = base.FunctionDeclaration;
  base.SequenceExpression = base.TemplateLiteral = function(node, st, c) {
    for (var i = 0; i < node.expressions.length; ++i)
      c(node.expressions[i], st, "Expression");
  };
  base.UnaryExpression = base.UpdateExpression = function(node, st, c) {
    c(node.argument, st, "Expression");
  };
  base.BinaryExpression = base.AssignmentExpression = base.AssignmentPattern = base.LogicalExpression = function(node, st, c) {
    c(node.left, st, "Expression");
    c(node.right, st, "Expression");
  };
  base.ConditionalExpression = function(node, st, c) {
    c(node.test, st, "Expression");
    c(node.consequent, st, "Expression");
    c(node.alternate, st, "Expression");
  };
  base.NewExpression = base.CallExpression = function(node, st, c) {
    c(node.callee, st, "Expression");
    if (node.arguments) for (var i = 0; i < node.arguments.length; ++i)
      c(node.arguments[i], st, "Expression");
  };
  base.MemberExpression = function(node, st, c) {
    c(node.object, st, "Expression");
    if (node.computed) c(node.property, st, "Expression");
  };
  base.ExportDeclaration = function (node, st, c) {
    c(node.declaration, st);
  };
  base.ImportDeclaration = function (node, st, c) {
    node.specifiers.forEach(function (specifier) {
      c(specifier, st);
    });
  };
  base.ImportSpecifier = base.ImportBatchSpecifier = base.Identifier = base.Literal = ignore;

  base.TaggedTemplateExpression = function(node, st, c) {
    c(node.tag, st, "Expression");
    c(node.quasi, st);
  };
  base.ClassDeclaration = base.ClassExpression = function(node, st, c) {
    if (node.superClass) c(node.superClass, st, "Expression");
    for (var i = 0; i < node.body.body.length; i++)
      c(node.body.body[i], st);
  };
  base.MethodDefinition = base.Property = function(node, st, c) {
    if (node.computed) c(node.key, st, "Expression");
    c(node.value, st, "Expression");
  };
  base.ComprehensionExpression = function(node, st, c) {
    for (var i = 0; i < node.blocks.length; i++)
      c(node.blocks[i].right, st, "Expression");
    c(node.body, st, "Expression");
  };

  // NOTE: the stuff below is deprecated, and will be removed when 1.0 is released

  // A custom walker that keeps track of the scope chain and the
  // variables defined in it.
  function makeScope(prev, isCatch) {
    return {vars: Object.create(null), prev: prev, isCatch: isCatch};
  }
  function normalScope(scope) {
    while (scope.isCatch) scope = scope.prev;
    return scope;
  }
  exports.scopeVisitor = exports.make({
    Function: function(node, scope, c) {
      var inner = makeScope(scope);
      for (var i = 0; i < node.params.length; ++i)
        inner.vars[node.params[i].name] = {type: "argument", node: node.params[i]};
      if (node.id) {
        var decl = node.type == "FunctionDeclaration";
        (decl ? normalScope(scope) : inner).vars[node.id.name] =
          {type: decl ? "function" : "function name", node: node.id};
      }
      c(node.body, inner, "ScopeBody");
    },
    TryStatement: function(node, scope, c) {
      c(node.block, scope, "Statement");
      if (node.handler) {
        var inner = makeScope(scope, true);
        inner.vars[node.handler.param.name] = {type: "catch clause", node: node.handler.param};
        c(node.handler.body, inner, "ScopeBody");
      }
      if (node.finalizer) c(node.finalizer, scope, "Statement");
    },
    VariableDeclaration: function(node, scope, c) {
      var target = normalScope(scope);
      for (var i = 0; i < node.declarations.length; ++i) {
        var decl = node.declarations[i];
        target.vars[decl.id.name] = {type: "var", node: decl.id};
        if (decl.init) c(decl.init, scope, "Expression");
      }
    }
  });

});

//#endregion


//#region tern/lib/signal.js

(function(root, mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(exports);
  if (typeof define == "function" && define.amd) // AMD
    return define(["exports"], mod);
  mod((root.tern || (root.tern = {})).signal = {}); // Plain browser env
})(this, function(exports) {
  function on(type, f) {
    var handlers = this._handlers || (this._handlers = Object.create(null));
    (handlers[type] || (handlers[type] = [])).push(f);
  }
  function off(type, f) {
    var arr = this._handlers && this._handlers[type];
    if (arr) for (var i = 0; i < arr.length; ++i)
      if (arr[i] == f) { arr.splice(i, 1); break; }
  }
  function signal(type, a1, a2, a3, a4) {
    var arr = this._handlers && this._handlers[type];
    if (arr) for (var i = 0; i < arr.length; ++i) arr[i].call(this, a1, a2, a3, a4);
  }

  exports.mixin = function(obj) {
    obj.on = on; obj.off = off; obj.signal = signal;
    return obj;
  };
});

//#endregion


//#region tern/lib/tern.js

// The Tern server object

// A server is a stateful object that manages the analysis for a
// project, and defines an interface for querying the code in the
// project.

(function(root, mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(exports, require("./infer"), require("./signal"),
               require("acorn/acorn"), require("acorn/util/walk"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["exports", "./infer", "./signal", "acorn/acorn", "acorn/util/walk"], mod);
  mod(root.tern || (root.tern = {}), tern, tern.signal, acorn, acorn.walk); // Plain browser env
})(this, function(exports, infer, signal, acorn, walk) {
  "use strict";

  var plugins = Object.create(null);
  exports.registerPlugin = function(name, init) { plugins[name] = init; };

  var defaultOptions = exports.defaultOptions = {
    debug: false,
    async: false,
    getFile: function(_f, c) { if (this.async) c(null, null); },
    defs: [],
    plugins: {},
    fetchTimeout: 1000,
    dependencyBudget: 20000,
    reuseInstances: true,
    stripCRs: false
  };

  var queryTypes = {
    completions: {
      takesFile: true,
      run: findCompletions
    },
    properties: {
      run: findProperties
    },
    type: {
      takesFile: true,
      run: findTypeAt
    },
    documentation: {
      takesFile: true,
      run: findDocs
    },
    definition: {
      takesFile: true,
      run: findDef
    },
    refs: {
      takesFile: true,
      fullFile: true,
      run: findRefs
    },
    rename: {
      takesFile: true,
      fullFile: true,
      run: buildRename
    },
    files: {
      run: listFiles
    }
  };

  exports.defineQueryType = function(name, desc) { queryTypes[name] = desc; };

  function File(name, parent) {
    this.name = name;
    this.parent = parent;
    this.scope = this.text = this.ast = this.lineOffsets = null;
  }
  File.prototype.asLineChar = function(pos) { return asLineChar(this, pos); };

  function updateText(file, text, srv) {
    file.text = srv.options.stripCRs ? text.replace(/\r\n/g, "\n") : text;
    infer.withContext(srv.cx, function() {
      file.ast = infer.parse(file.text, srv.passes, {directSourceFile: file, allowReturnOutsideFunction: true});
    });
    file.lineOffsets = null;
  }

  var Server = exports.Server = function(options) {
    this.cx = null;
    this.options = options || {};
    for (var o in defaultOptions) if (!options.hasOwnProperty(o))
      options[o] = defaultOptions[o];

    this.handlers = Object.create(null);
    this.files = [];
    this.fileMap = Object.create(null);
    this.needsPurge = [];
    this.budgets = Object.create(null);
    this.uses = 0;
    this.pending = 0;
    this.asyncError = null;
    this.passes = Object.create(null);

    this.defs = options.defs.slice(0);
    for (var plugin in options.plugins) if (options.plugins.hasOwnProperty(plugin) && plugin in plugins) {
      var init = plugins[plugin](this, options.plugins[plugin]);
      if (init && init.defs) {
        if (init.loadFirst) this.defs.unshift(init.defs);
        else this.defs.push(init.defs);
      }
      if (init && init.passes) for (var type in init.passes) if (init.passes.hasOwnProperty(type))
        (this.passes[type] || (this.passes[type] = [])).push(init.passes[type]);
    }

    this.reset();
  };
  Server.prototype = signal.mixin({
    addFile: function(name, /*optional*/ text, parent) {
      // Don't crash when sloppy plugins pass non-existent parent ids
      if (parent && !(parent in this.fileMap)) parent = null;
      ensureFile(this, name, parent, text);
    },
    delFile: function(name) {
      var file = this.findFile(name);
      if (file) {
        this.needsPurge.push(file.name);
        this.files.splice(this.files.indexOf(file), 1);
        delete this.fileMap[name];
      }
    },
    reset: function() {
      this.signal("reset");
      this.cx = new infer.Context(this.defs, this);
      this.uses = 0;
      this.budgets = Object.create(null);
      for (var i = 0; i < this.files.length; ++i) {
        var file = this.files[i];
        file.scope = null;
      }
    },

    request: function(doc, c) {
      var inv = invalidDoc(doc);
      if (inv) return c(inv);

      var self = this;
      doRequest(this, doc, function(err, data) {
        c(err, data);
        if (self.uses > 40) {
          self.reset();
          analyzeAll(self, null, function(){});
        }
      });
    },

    findFile: function(name) {
      return this.fileMap[name];
    },

    flush: function(c) {
      var cx = this.cx;
      analyzeAll(this, null, function(err) {
        if (err) return c(err);
        infer.withContext(cx, c);
      });
    },

    startAsyncAction: function() {
      ++this.pending;
    },
    finishAsyncAction: function(err) {
      if (err) this.asyncError = err;
      if (--this.pending === 0) this.signal("everythingFetched");
    }
  });

  function doRequest(srv, doc, c) {
    if (doc.query && !queryTypes.hasOwnProperty(doc.query.type))
      return c("No query type '" + doc.query.type + "' defined");

    var query = doc.query;
    // Respond as soon as possible when this just uploads files
    if (!query) c(null, {});

    var files = doc.files || [];
    if (files.length) ++srv.uses;
    for (var i = 0; i < files.length; ++i) {
      var file = files[i];
      if (file.type == "delete")
        srv.delFile(file.name);
      else
        ensureFile(srv, file.name, null, file.type == "full" ? file.text : null);
    }

    var timeBudget = typeof doc.timeout == "number" ? [doc.timeout] : null;
    if (!query) {
      analyzeAll(srv, timeBudget, function(){});
      return;
    }

    var queryType = queryTypes[query.type];
    if (queryType.takesFile) {
      if (typeof query.file != "string") return c(".query.file must be a string");
      if (!/^#/.test(query.file)) ensureFile(srv, query.file, null);
    }

    analyzeAll(srv, timeBudget, function(err) {
      if (err) return c(err);
      var file = queryType.takesFile && resolveFile(srv, files, query.file);
      if (queryType.fullFile && file.type == "part")
        return c("Can't run a " + query.type + " query on a file fragment");

      function run() {
        var result;
        try {
          result = queryType.run(srv, query, file);
        } catch (e) {
          if (srv.options.debug && e.name != "TernError") console.error(e.stack);
          return c(e);
        }
        c(null, result);
      }
      infer.withContext(srv.cx, timeBudget ? function() { infer.withTimeout(timeBudget[0], run); } : run);
    });
  }

  function analyzeFile(srv, file) {
    infer.withContext(srv.cx, function() {
      file.scope = srv.cx.topScope;
      srv.signal("beforeLoad", file);
      infer.analyze(file.ast, file.name, file.scope, srv.passes);
      srv.signal("afterLoad", file);
    });
    return file;
  }

  function ensureFile(srv, name, parent, text) {
    var known = srv.findFile(name);
    if (known) {
      if (text != null) {
        if (known.scope) {
          srv.needsPurge.push(name);
          known.scope = null;
        }
        updateText(known, text, srv);
      }
      if (parentDepth(srv, known.parent) > parentDepth(srv, parent)) {
        known.parent = parent;
        if (known.excluded) known.excluded = null;
      }
      return;
    }

    var file = new File(name, parent);
    srv.files.push(file);
    srv.fileMap[name] = file;
    if (text != null) {
      updateText(file, text, srv);
    } else if (srv.options.async) {
      srv.startAsyncAction();
      srv.options.getFile(name, function(err, text) {
        updateText(file, text || "", srv);
        srv.finishAsyncAction(err);
      });
    } else {
      updateText(file, srv.options.getFile(name) || "", srv);
    }
  }

  function fetchAll(srv, c) {
    var done = true, returned = false;
    srv.files.forEach(function(file) {
      if (file.text != null) return;
      if (srv.options.async) {
        done = false;
        srv.options.getFile(file.name, function(err, text) {
          if (err && !returned) { returned = true; return c(err); }
          updateText(file, text || "", srv);
          fetchAll(srv, c);
        });
      } else {
        try {
          updateText(file, srv.options.getFile(file.name) || "", srv);
        } catch (e) { return c(e); }
      }
    });
    if (done) c();
  }

  function waitOnFetch(srv, timeBudget, c) {
    var done = function() {
      srv.off("everythingFetched", done);
      clearTimeout(timeout);
      analyzeAll(srv, timeBudget, c);
    };
    srv.on("everythingFetched", done);
    var timeout = setTimeout(done, srv.options.fetchTimeout);
  }

  function analyzeAll(srv, timeBudget, c) {
    if (srv.pending) return waitOnFetch(srv, timeBudget, c);

    var e = srv.fetchError;
    if (e) { srv.fetchError = null; return c(e); }

    if (srv.needsPurge.length > 0) infer.withContext(srv.cx, function() {
      infer.purge(srv.needsPurge);
      srv.needsPurge.length = 0;
    });

    var done = true;
    // The second inner loop might add new files. The outer loop keeps
    // repeating both inner loops until all files have been looked at.
    for (var i = 0; i < srv.files.length;) {
      var toAnalyze = [];
      for (; i < srv.files.length; ++i) {
        var file = srv.files[i];
        if (file.text == null) done = false;
        else if (file.scope == null && !file.excluded) toAnalyze.push(file);
      }
      toAnalyze.sort(function(a, b) {
        return parentDepth(srv, a.parent) - parentDepth(srv, b.parent);
      });
      for (var j = 0; j < toAnalyze.length; j++) {
        var file = toAnalyze[j];
        if (file.parent && !chargeOnBudget(srv, file)) {
          file.excluded = true;
        } else if (timeBudget) {
          var startTime = +new Date;
          infer.withTimeout(timeBudget[0], function() { analyzeFile(srv, file); });
          timeBudget[0] -= +new Date - startTime;
        } else {
          analyzeFile(srv, file);
        }
      }
    }
    if (done) c();
    else waitOnFetch(srv, timeBudget, c);
  }

  function firstLine(str) {
    var end = str.indexOf("\n");
    if (end < 0) return str;
    return str.slice(0, end);
  }

  function findMatchingPosition(line, file, near) {
    var pos = Math.max(0, near - 500), closest = null;
    if (!/^\s*$/.test(line)) for (;;) {
      var found = file.indexOf(line, pos);
      if (found < 0 || found > near + 500) break;
      if (closest == null || Math.abs(closest - near) > Math.abs(found - near))
        closest = found;
      pos = found + line.length;
    }
    return closest;
  }

  function scopeDepth(s) {
    for (var i = 0; s; ++i, s = s.prev) {}
    return i;
  }

  function ternError(msg) {
    var err = new Error(msg);
    err.name = "TernError";
    return err;
  }

  function resolveFile(srv, localFiles, name) {
    var isRef = name.match(/^#(\d+)$/);
    if (!isRef) return srv.findFile(name);

    var file = localFiles[isRef[1]];
    if (!file || file.type == "delete") throw ternError("Reference to unknown file " + name);
    if (file.type == "full") return srv.findFile(file.name);

    // This is a partial file

    var realFile = file.backing = srv.findFile(file.name);
    var offset = file.offset;
    if (file.offsetLines) offset = {line: file.offsetLines, ch: 0};
    file.offset = offset = resolvePos(realFile, file.offsetLines == null ? file.offset : {line: file.offsetLines, ch: 0}, true);
    var line = firstLine(file.text);
    var foundPos = findMatchingPosition(line, realFile.text, offset);
    var pos = foundPos == null ? Math.max(0, realFile.text.lastIndexOf("\n", offset)) : foundPos;
    var inObject, atFunction;

    infer.withContext(srv.cx, function() {
      infer.purge(file.name, pos, pos + file.text.length);

      var text = file.text, m;
      if (m = text.match(/(?:"([^"]*)"|([\w$]+))\s*:\s*function\b/)) {
        var objNode = walk.findNodeAround(file.backing.ast, pos, "ObjectExpression");
        if (objNode && objNode.node.objType)
          inObject = {type: objNode.node.objType, prop: m[2] || m[1]};
      }
      if (foundPos && (m = line.match(/^(.*?)\bfunction\b/))) {
        var cut = m[1].length, white = "";
        for (var i = 0; i < cut; ++i) white += " ";
        text = white + text.slice(cut);
        atFunction = true;
      }

      var scopeStart = infer.scopeAt(realFile.ast, pos, realFile.scope);
      var scopeEnd = infer.scopeAt(realFile.ast, pos + text.length, realFile.scope);
      var scope = file.scope = scopeDepth(scopeStart) < scopeDepth(scopeEnd) ? scopeEnd : scopeStart;
      file.ast = infer.parse(text, srv.passes, {directSourceFile: file, allowReturnOutsideFunction: true});
      infer.analyze(file.ast, file.name, scope, srv.passes);

      // This is a kludge to tie together the function types (if any)
      // outside and inside of the fragment, so that arguments and
      // return values have some information known about them.
      tieTogether: if (inObject || atFunction) {
        var newInner = infer.scopeAt(file.ast, line.length, scopeStart);
        if (!newInner.fnType) break tieTogether;
        if (inObject) {
          var prop = inObject.type.getProp(inObject.prop);
          prop.addType(newInner.fnType);
        } else if (atFunction) {
          var inner = infer.scopeAt(realFile.ast, pos + line.length, realFile.scope);
          if (inner == scopeStart || !inner.fnType) break tieTogether;
          var fOld = inner.fnType, fNew = newInner.fnType;
          if (!fNew || (fNew.name != fOld.name && fOld.name)) break tieTogether;
          for (var i = 0, e = Math.min(fOld.args.length, fNew.args.length); i < e; ++i)
            fOld.args[i].propagate(fNew.args[i]);
          fOld.self.propagate(fNew.self);
          fNew.retval.propagate(fOld.retval);
        }
      }
    });
    return file;
  }

  // Budget management

  function astSize(node) {
    var size = 0;
    walk.simple(node, {Expression: function() { ++size; }});
    return size;
  }

  function parentDepth(srv, parent) {
    var depth = 0;
    while (parent) {
      parent = srv.findFile(parent).parent;
      ++depth;
    }
    return depth;
  }

  function budgetName(srv, file) {
    for (;;) {
      var parent = srv.findFile(file.parent);
      if (!parent.parent) break;
      file = parent;
    }
    return file.name;
  }

  function chargeOnBudget(srv, file) {
    var bName = budgetName(srv, file);
    var size = astSize(file.ast);
    var known = srv.budgets[bName];
    if (known == null)
      known = srv.budgets[bName] = srv.options.dependencyBudget;
    if (known < size) return false;
    srv.budgets[bName] = known - size;
    return true;
  }

  // Query helpers

  function isPosition(val) {
    return typeof val == "number" || typeof val == "object" &&
      typeof val.line == "number" && typeof val.ch == "number";
  }

  // Baseline query document validation
  function invalidDoc(doc) {
    if (doc.query) {
      if (typeof doc.query.type != "string") return ".query.type must be a string";
      if (doc.query.start && !isPosition(doc.query.start)) return ".query.start must be a position";
      if (doc.query.end && !isPosition(doc.query.end)) return ".query.end must be a position";
    }
    if (doc.files) {
      if (!Array.isArray(doc.files)) return "Files property must be an array";
      for (var i = 0; i < doc.files.length; ++i) {
        var file = doc.files[i];
        if (typeof file != "object") return ".files[n] must be objects";
        else if (typeof file.name != "string") return ".files[n].name must be a string";
        else if (file.type == "delete") continue;
        else if (typeof file.text != "string") return ".files[n].text must be a string";
        else if (file.type == "part") {
          if (!isPosition(file.offset) && typeof file.offsetLines != "number")
            return ".files[n].offset must be a position";
        } else if (file.type != "full") return ".files[n].type must be \"full\" or \"part\"";
      }
    }
  }

  var offsetSkipLines = 25;

  function findLineStart(file, line) {
    var text = file.text, offsets = file.lineOffsets || (file.lineOffsets = [0]);
    var pos = 0, curLine = 0;
    var storePos = Math.min(Math.floor(line / offsetSkipLines), offsets.length - 1);
    var pos = offsets[storePos], curLine = storePos * offsetSkipLines;

    while (curLine < line) {
      ++curLine;
      pos = text.indexOf("\n", pos) + 1;
      if (pos === 0) return null;
      if (curLine % offsetSkipLines === 0) offsets.push(pos);
    }
    return pos;
  }

  var resolvePos = exports.resolvePos = function(file, pos, tolerant) {
    if (typeof pos != "number") {
      var lineStart = findLineStart(file, pos.line);
      if (lineStart == null) {
        if (tolerant) pos = file.text.length;
        else throw ternError("File doesn't contain a line " + pos.line);
      } else {
        pos = lineStart + pos.ch;
      }
    }
    if (pos > file.text.length) {
      if (tolerant) pos = file.text.length;
      else throw ternError("Position " + pos + " is outside of file.");
    }
    return pos;
  };

  function asLineChar(file, pos) {
    if (!file) return {line: 0, ch: 0};
    var offsets = file.lineOffsets || (file.lineOffsets = [0]);
    var text = file.text, line, lineStart;
    for (var i = offsets.length - 1; i >= 0; --i) if (offsets[i] <= pos) {
      line = i * offsetSkipLines;
      lineStart = offsets[i];
    }
    for (;;) {
      var eol = text.indexOf("\n", lineStart);
      if (eol >= pos || eol < 0) break;
      lineStart = eol + 1;
      ++line;
    }
    return {line: line, ch: pos - lineStart};
  }

  var outputPos = exports.outputPos = function(query, file, pos) {
    if (query.lineCharPositions) {
      var out = asLineChar(file, pos);
      if (file.type == "part")
        out.line += file.offsetLines != null ? file.offsetLines : asLineChar(file.backing, file.offset).line;
      return out;
    } else {
      return pos + (file.type == "part" ? file.offset : 0);
    }
  };

  // Delete empty fields from result objects
  function clean(obj) {
    for (var prop in obj) if (obj[prop] == null) delete obj[prop];
    return obj;
  }
  function maybeSet(obj, prop, val) {
    if (val != null) obj[prop] = val;
  }

  // Built-in query types

  function compareCompletions(a, b) {
    if (typeof a != "string") { a = a.name; b = b.name; }
    var aUp = /^[A-Z]/.test(a), bUp = /^[A-Z]/.test(b);
    if (aUp == bUp) return a < b ? -1 : a == b ? 0 : 1;
    else return aUp ? 1 : -1;
  }

  function isStringAround(node, start, end) {
    return node.type == "Literal" && typeof node.value == "string" &&
      node.start == start - 1 && node.end <= end + 1;
  }

  function pointInProp(objNode, point) {
    for (var i = 0; i < objNode.properties.length; i++) {
      var curProp = objNode.properties[i];
      if (curProp.key.start <= point && curProp.key.end >= point)
        return curProp;
    }
  }

  var jsKeywords = ("break do instanceof typeof case else new var " +
    "catch finally return void continue for switch while debugger " +
    "function this with default if throw delete in try").split(" ");

  function findCompletions(srv, query, file) {
    if (query.end == null) throw ternError("missing .query.end field");
    if (srv.passes.completion) for (var i = 0; i < srv.passes.completion.length; i++) {
      var result = srv.passes.completion[i](file, query);
      if (result) return result;
    }

    var wordStart = resolvePos(file, query.end), wordEnd = wordStart, text = file.text;
    while (wordStart && acorn.isIdentifierChar(text.charCodeAt(wordStart - 1))) --wordStart;
    if (query.expandWordForward !== false)
      while (wordEnd < text.length && acorn.isIdentifierChar(text.charCodeAt(wordEnd))) ++wordEnd;
    var word = text.slice(wordStart, wordEnd), completions = [], ignoreObj;
    if (query.caseInsensitive) word = word.toLowerCase();
    var wrapAsObjs = query.types || query.depths || query.docs || query.urls || query.origins;

    function gather(prop, obj, depth, addInfo) {
      // 'hasOwnProperty' and such are usually just noise, leave them
      // out when no prefix is provided.
      if (query.omitObjectPrototype !== false && obj == srv.cx.protos.Object && !word) return;
      if (query.filter !== false && word &&
          (query.caseInsensitive ? prop.toLowerCase() : prop).indexOf(word) !== 0) return;
      if (ignoreObj && ignoreObj.props[prop]) return;
      for (var i = 0; i < completions.length; ++i) {
        var c = completions[i];
        if ((wrapAsObjs ? c.name : c) == prop) return;
      }
      var rec = wrapAsObjs ? {name: prop} : prop;
      completions.push(rec);

      if (obj && (query.types || query.docs || query.urls || query.origins)) {
        var val = obj.props[prop];
        infer.resetGuessing();
        var type = val.getType();
        rec.guess = infer.didGuess();
        if (query.types)
          rec.type = infer.toString(val);
        if (query.docs)
          maybeSet(rec, "doc", val.doc || type && type.doc);
        if (query.urls)
          maybeSet(rec, "url", val.url || type && type.url);
        if (query.origins)
          maybeSet(rec, "origin", val.origin || type && type.origin);
      }
      if (query.depths) rec.depth = depth;
      if (wrapAsObjs && addInfo) addInfo(rec);
    }

    var hookname, prop, objType, isKey;

    var exprAt = infer.findExpressionAround(file.ast, null, wordStart, file.scope);
    var memberExpr, objLit;
    // Decide whether this is an object property, either in a member
    // expression or an object literal.
    if (exprAt) {
      if (exprAt.node.type == "MemberExpression" && exprAt.node.object.end < wordStart) {
        memberExpr = exprAt;
      } else if (isStringAround(exprAt.node, wordStart, wordEnd)) {
        var parent = infer.parentNode(exprAt.node, file.ast);
        if (parent.type == "MemberExpression" && parent.property == exprAt.node)
          memberExpr = {node: parent, state: exprAt.state};
      } else if (exprAt.node.type == "ObjectExpression") {
        var objProp = pointInProp(exprAt.node, wordEnd);
        if (objProp) {
          objLit = exprAt;
          prop = isKey = objProp.key.name;
        } else if (!word && !/:\s*$/.test(file.text.slice(0, wordStart))) {
          objLit = exprAt;
          prop = isKey = true;
        }
      }
    }

    if (objLit) {
      // Since we can't use the type of the literal itself to complete
      // its properties (it doesn't contain the information we need),
      // we have to try asking the surrounding expression for type info.
      objType = infer.typeFromContext(file.ast, objLit);
      ignoreObj = objLit.node.objType;
    } else if (memberExpr) {
      prop = memberExpr.node.property;
      prop = prop.type == "Literal" ? prop.value.slice(1) : prop.name;
      memberExpr.node = memberExpr.node.object;
      objType = infer.expressionType(memberExpr);
    } else if (text.charAt(wordStart - 1) == ".") {
      var pathStart = wordStart - 1;
      while (pathStart && (text.charAt(pathStart - 1) == "." || acorn.isIdentifierChar(text.charCodeAt(pathStart - 1)))) pathStart--;
      var path = text.slice(pathStart, wordStart - 1);
      if (path) {
        objType = infer.def.parsePath(path, file.scope).getObjType();
        prop = word;
      }
    }

    if (prop != null) {
      srv.cx.completingProperty = prop;

      if (objType) infer.forAllPropertiesOf(objType, gather);

      if (!completions.length && query.guess !== false && objType && objType.guessProperties)
        objType.guessProperties(function(p, o, d) {if (p != prop && p != "✖") gather(p, o, d);});
      if (!completions.length && word.length >= 2 && query.guess !== false)
        for (var prop in srv.cx.props) gather(prop, srv.cx.props[prop][0], 0);
      hookname = "memberCompletion";
    } else {
      infer.forAllLocalsAt(file.ast, wordStart, file.scope, gather);
      if (query.includeKeywords) jsKeywords.forEach(function(kw) {
        gather(kw, null, 0, function(rec) { rec.isKeyword = true; });
      });
      hookname = "variableCompletion";
    }
    if (srv.passes[hookname])
      srv.passes[hookname].forEach(function(hook) {hook(file, wordStart, wordEnd, gather);});

    if (query.sort !== false) completions.sort(compareCompletions);
    srv.cx.completingProperty = null;

    return {start: outputPos(query, file, wordStart),
            end: outputPos(query, file, wordEnd),
            isProperty: !!prop,
            isObjectKey: !!isKey,
            completions: completions};
  }

  function findProperties(srv, query) {
    var prefix = query.prefix, found = [];
    for (var prop in srv.cx.props)
      if (prop != "<i>" && (!prefix || prop.indexOf(prefix) === 0)) found.push(prop);
    if (query.sort !== false) found.sort(compareCompletions);
    return {completions: found};
  }

  var findExpr = exports.findQueryExpr = function(file, query, wide) {
    if (query.end == null) throw ternError("missing .query.end field");

    if (query.variable) {
      var scope = infer.scopeAt(file.ast, resolvePos(file, query.end), file.scope);
      return {node: {type: "Identifier", name: query.variable, start: query.end, end: query.end + 1},
              state: scope};
    } else {
      var start = query.start && resolvePos(file, query.start), end = resolvePos(file, query.end);
      var expr = infer.findExpressionAt(file.ast, start, end, file.scope);
      if (expr) return expr;
      expr = infer.findExpressionAround(file.ast, start, end, file.scope);
      if (expr && (expr.node.type == "ObjectExpression" || wide ||
                   (start == null ? end : start) - expr.node.start < 20 || expr.node.end - end < 20))
        return expr;
      return null;
    }
  };

  function findExprOrThrow(file, query, wide) {
    var expr = findExpr(file, query, wide);
    if (expr) return expr;
    throw ternError("No expression at the given position.");
  }

  function ensureObj(tp) {
    if (!tp || !(tp = tp.getType()) || !(tp instanceof infer.Obj)) return null;
    return tp;
  }

  function findExprType(srv, query, file, expr) {
    var type;
    if (expr) {
      infer.resetGuessing();
      type = infer.expressionType(expr);
    }
    if (srv.passes["typeAt"]) {
      var pos = resolvePos(file, query.end);
      srv.passes["typeAt"].forEach(function(hook) {
        type = hook(file, pos, expr, type);
      });
    }
    if (!type) throw ternError("No type found at the given position.");

    var objProp;
    if (expr.node.type == "ObjectExpression" && query.end != null &&
        (objProp = pointInProp(expr.node, resolvePos(file, query.end)))) {
      var name = objProp.key.name;
      var fromCx = ensureObj(infer.typeFromContext(file.ast, expr));
      if (fromCx && fromCx.hasProp(name)) {
        type = fromCx.hasProp(name);
      } else {
        var fromLocal = ensureObj(type);
        if (fromLocal && fromLocal.hasProp(name))
          type = fromLocal.hasProp(name);
      }
    }
    return type;
  };

  function findTypeAt(srv, query, file) {
    var expr = findExpr(file, query), exprName;
    var type = findExprType(srv, query, file, expr), exprType = type;
    if (query.preferFunction)
      type = type.getFunctionType() || type.getType();
    else
      type = type.getType();

    if (expr) {
      if (expr.node.type == "Identifier")
        exprName = expr.node.name;
      else if (expr.node.type == "MemberExpression" && !expr.node.computed)
        exprName = expr.node.property.name;
    }

    if (query.depth != null && typeof query.depth != "number")
      throw ternError(".query.depth must be a number");

    var result = {guess: infer.didGuess(),
                  type: infer.toString(exprType, query.depth),
                  name: type && type.name,
                  exprName: exprName};
    if (type) storeTypeDocs(type, result);
    if (!result.doc && exprType.doc) result.doc = exprType.doc;

    return clean(result);
  }

  function findDocs(srv, query, file) {
    var expr = findExpr(file, query);
    var type = findExprType(srv, query, file, expr);
    var result = {url: type.url, doc: type.doc, type: infer.toString(type)};
    var inner = type.getType();
    if (inner) storeTypeDocs(inner, result);
    return clean(result);
  }

  function storeTypeDocs(type, out) {
    if (!out.url) out.url = type.url;
    if (!out.doc) out.doc = type.doc;
    if (!out.origin) out.origin = type.origin;
    var ctor, boring = infer.cx().protos;
    if (!out.url && !out.doc && type.proto && (ctor = type.proto.hasCtor) &&
        type.proto != boring.Object && type.proto != boring.Function && type.proto != boring.Array) {
      out.url = ctor.url;
      out.doc = ctor.doc;
    }
  }

  var getSpan = exports.getSpan = function(obj) {
    if (!obj.origin) return;
    if (obj.originNode) {
      var node = obj.originNode;
      if (/^Function/.test(node.type) && node.id) node = node.id;
      return {origin: obj.origin, node: node};
    }
    if (obj.span) return {origin: obj.origin, span: obj.span};
  };

  var storeSpan = exports.storeSpan = function(srv, query, span, target) {
    target.origin = span.origin;
    if (span.span) {
      var m = /^(\d+)\[(\d+):(\d+)\]-(\d+)\[(\d+):(\d+)\]$/.exec(span.span);
      target.start = query.lineCharPositions ? {line: Number(m[2]), ch: Number(m[3])} : Number(m[1]);
      target.end = query.lineCharPositions ? {line: Number(m[5]), ch: Number(m[6])} : Number(m[4]);
    } else {
      var file = srv.findFile(span.origin);
      target.start = outputPos(query, file, span.node.start);
      target.end = outputPos(query, file, span.node.end);
    }
  };

  function findDef(srv, query, file) {
    var expr = findExpr(file, query);
    var type = findExprType(srv, query, file, expr);
    if (infer.didGuess()) return {};

    var span = getSpan(type);
    var result = {url: type.url, doc: type.doc, origin: type.origin};

    if (type.types) for (var i = type.types.length - 1; i >= 0; --i) {
      var tp = type.types[i];
      storeTypeDocs(tp, result);
      if (!span) span = getSpan(tp);
    }

    if (span && span.node) { // refers to a loaded file
      var spanFile = span.node.sourceFile || srv.findFile(span.origin);
      var start = outputPos(query, spanFile, span.node.start), end = outputPos(query, spanFile, span.node.end);
      result.start = start; result.end = end;
      result.file = span.origin;
      var cxStart = Math.max(0, span.node.start - 50);
      result.contextOffset = span.node.start - cxStart;
      result.context = spanFile.text.slice(cxStart, cxStart + 50);
    } else if (span) { // external
      result.file = span.origin;
      storeSpan(srv, query, span, result);
    }
    return clean(result);
  }

  function findRefsToVariable(srv, query, file, expr, checkShadowing) {
    var name = expr.node.name;

    for (var scope = expr.state; scope && !(name in scope.props); scope = scope.prev) {}
    if (!scope) throw ternError("Could not find a definition for " + name + " " + !!srv.cx.topScope.props.x);

    var type, refs = [];
    function storeRef(file) {
      return function(node, scopeHere) {
        if (checkShadowing) for (var s = scopeHere; s != scope; s = s.prev) {
          var exists = s.hasProp(checkShadowing);
          if (exists)
            throw ternError("Renaming `" + name + "` to `" + checkShadowing + "` would make a variable at line " +
                            (asLineChar(file, node.start).line + 1) + " point to the definition at line " +
                            (asLineChar(file, exists.name.start).line + 1));
        }
        refs.push({file: file.name,
                   start: outputPos(query, file, node.start),
                   end: outputPos(query, file, node.end)});
      };
    }

    if (scope.originNode) {
      type = "local";
      if (checkShadowing) {
        for (var prev = scope.prev; prev; prev = prev.prev)
          if (checkShadowing in prev.props) break;
        if (prev) infer.findRefs(scope.originNode, scope, checkShadowing, prev, function(node) {
          throw ternError("Renaming `" + name + "` to `" + checkShadowing + "` would shadow the definition used at line " +
                          (asLineChar(file, node.start).line + 1));
        });
      }
      infer.findRefs(scope.originNode, scope, name, scope, storeRef(file));
    } else {
      type = "global";
      for (var i = 0; i < srv.files.length; ++i) {
        var cur = srv.files[i];
        infer.findRefs(cur.ast, cur.scope, name, scope, storeRef(cur));
      }
    }

    return {refs: refs, type: type, name: name};
  }

  function findRefsToProperty(srv, query, expr, prop) {
    var objType = infer.expressionType(expr).getObjType();
    if (!objType) throw ternError("Couldn't determine type of base object.");

    var refs = [];
    function storeRef(file) {
      return function(node) {
        refs.push({file: file.name,
                   start: outputPos(query, file, node.start),
                   end: outputPos(query, file, node.end)});
      };
    }
    for (var i = 0; i < srv.files.length; ++i) {
      var cur = srv.files[i];
      infer.findPropRefs(cur.ast, cur.scope, objType, prop.name, storeRef(cur));
    }

    return {refs: refs, name: prop.name};
  }

  function findRefs(srv, query, file) {
    var expr = findExprOrThrow(file, query, true);
    if (expr && expr.node.type == "Identifier") {
      return findRefsToVariable(srv, query, file, expr);
    } else if (expr && expr.node.type == "MemberExpression" && !expr.node.computed) {
      var p = expr.node.property;
      expr.node = expr.node.object;
      return findRefsToProperty(srv, query, expr, p);
    } else if (expr && expr.node.type == "ObjectExpression") {
      var pos = resolvePos(file, query.end);
      for (var i = 0; i < expr.node.properties.length; ++i) {
        var k = expr.node.properties[i].key;
        if (k.start <= pos && k.end >= pos)
          return findRefsToProperty(srv, query, expr, k);
      }
    }
    throw ternError("Not at a variable or property name.");
  }

  function buildRename(srv, query, file) {
    if (typeof query.newName != "string") throw ternError(".query.newName should be a string");
    var expr = findExprOrThrow(file, query);
    if (!expr || expr.node.type != "Identifier") throw ternError("Not at a variable.");

    var data = findRefsToVariable(srv, query, file, expr, query.newName), refs = data.refs;
    delete data.refs;
    data.files = srv.files.map(function(f){return f.name;});

    var changes = data.changes = [];
    for (var i = 0; i < refs.length; ++i) {
      var use = refs[i];
      use.text = query.newName;
      changes.push(use);
    }

    return data;
  }

  function listFiles(srv) {
    return {files: srv.files.map(function(f){return f.name;})};
  }

  exports.version = "0.9.1";
});

//#endregion


//#region tern/lib/def.js

// Type description parser
//
// Type description JSON files (such as ecma5.json and browser.json)
// are used to
//
// A) describe types that come from native code
//
// B) to cheaply load the types for big libraries, or libraries that
//    can't be inferred well

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return exports.init = mod;
  if (typeof define == "function" && define.amd) // AMD
    return define({init: mod});
  tern.def = {init: mod};
})(function(exports, infer) {
  "use strict";

  function hop(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
  }

  var TypeParser = exports.TypeParser = function(spec, start, base, forceNew) {
    this.pos = start || 0;
    this.spec = spec;
    this.base = base;
    this.forceNew = forceNew;
  };
  TypeParser.prototype = {
    eat: function(str) {
      if (str.length == 1 ? this.spec.charAt(this.pos) == str : this.spec.indexOf(str, this.pos) == this.pos) {
        this.pos += str.length;
        return true;
      }
    },
    word: function(re) {
      var word = "", ch, re = re || /[\w$]/;
      while ((ch = this.spec.charAt(this.pos)) && re.test(ch)) { word += ch; ++this.pos; }
      return word;
    },
    error: function() {
      throw new Error("Unrecognized type spec: " + this.spec + " (at " + this.pos + ")");
    },
    parseFnType: function(name, top) {
      var args = [], names = [];
      if (!this.eat(")")) for (var i = 0; ; ++i) {
        var colon = this.spec.indexOf(": ", this.pos), argname;
        if (colon != -1) {
          argname = this.spec.slice(this.pos, colon);
          if (/^[$\w?]+$/.test(argname))
            this.pos = colon + 2;
          else
            argname = null;
        }
        names.push(argname);
        args.push(this.parseType());
        if (!this.eat(", ")) {
          this.eat(")") || this.error();
          break;
        }
      }
      var retType, computeRet, computeRetStart, fn;
      if (this.eat(" -> ")) {
        if (top && this.spec.indexOf("!", this.pos) > -1) {
          retType = infer.ANull;
          computeRetStart = this.pos;
          computeRet = this.parseRetType();
        } else retType = this.parseType();
      } else retType = infer.ANull;
      if (top && (fn = this.base))
        infer.Fn.call(this.base, name, infer.ANull, args, names, retType);
      else
        fn = new infer.Fn(name, infer.ANull, args, names, retType);
      if (computeRet) fn.computeRet = computeRet;
      if (computeRetStart != null) fn.computeRetSource = this.spec.slice(computeRetStart, this.pos);
      return fn;
    },
    parseType: function(name, top) {
      var type, union = false;
      for (;;) {
        var inner = this.parseTypeInner(name, top);
        if (union) inner.propagate(union);
        else type = inner;
        if (!this.eat("|")) break;
        if (!union) {
          union = new infer.AVal;
          type.propagate(union);
          type = union;
        }
      }
      return type;
    },
    parseTypeInner: function(name, top) {
      if (this.eat("fn(")) {
        return this.parseFnType(name, top);
      } else if (this.eat("[")) {
        var inner = this.parseType();
        this.eat("]") || this.error();
        if (top && this.base) {
          infer.Arr.call(this.base, inner);
          return this.base;
        }
        return new infer.Arr(inner);
      } else if (this.eat("+")) {
        var path = this.word(/[\w$<>\.!]/);
        var base = parsePath(path + ".prototype");
        if (!(base instanceof infer.Obj)) base = parsePath(path);
        if (!(base instanceof infer.Obj)) return base;
        if (top && this.forceNew) return new infer.Obj(base);
        return infer.getInstance(base);
      } else if (this.eat("?")) {
        return infer.ANull;
      } else {
        return this.fromWord(this.word(/[\w$<>\.!`]/));
      }
    },
    fromWord: function(spec) {
      var cx = infer.cx();
      switch (spec) {
      case "number": return cx.num;
      case "string": return cx.str;
      case "bool": return cx.bool;
      case "<top>": return cx.topScope;
      }
      if (cx.localDefs && spec in cx.localDefs) return cx.localDefs[spec];
      return parsePath(spec);
    },
    parseBaseRetType: function() {
      if (this.eat("[")) {
        var inner = this.parseRetType();
        this.eat("]") || this.error();
        return function(self, args) { return new infer.Arr(inner(self, args)); };
      } else if (this.eat("+")) {
        var base = this.parseRetType();
        var result = function(self, args) {
          var proto = base(self, args);
          if (proto instanceof infer.Fn && proto.hasProp("prototype"))
            proto = proto.getProp("prototype").getObjType();
          if (!(proto instanceof infer.Obj)) return proto;
          return new infer.Obj(proto);
        };
        if (this.eat("[")) return this.parsePoly(result);
        return result;
      } else if (this.eat("!")) {
        var arg = this.word(/\d/);
        if (arg) {
          arg = Number(arg);
          return function(_self, args) {return args[arg] || infer.ANull;};
        } else if (this.eat("this")) {
          return function(self) {return self;};
        } else if (this.eat("custom:")) {
          var fname = this.word(/[\w$]/);
          return customFunctions[fname] || function() { return infer.ANull; };
        } else {
          return this.fromWord("!" + arg + this.word(/[\w$<>\.!]/));
        }
      }
      var t = this.parseType();
      return function(){return t;};
    },
    extendRetType: function(base) {
      var propName = this.word(/[\w<>$!]/) || this.error();
      if (propName == "!ret") return function(self, args) {
        var lhs = base(self, args);
        if (lhs.retval) return lhs.retval;
        var rv = new infer.AVal;
        lhs.propagate(new infer.IsCallee(infer.ANull, [], null, rv));
        return rv;
      };
      return function(self, args) {return base(self, args).getProp(propName);};
    },
    parsePoly: function(base) {
      var propName = "<i>", match;
      if (match = this.spec.slice(this.pos).match(/^\s*(\w+)\s*=\s*/)) {
        propName = match[1];
        this.pos += match[0].length;
      }
      var value = this.parseRetType();
      if (!this.eat("]")) this.error();
      return function(self, args) {
        var instance = base(self, args);
        if (instance instanceof infer.Obj)
          value(self, args).propagate(instance.defProp(propName));
        return instance;
      };
    },
    parseRetType: function() {
      var tp = this.parseBaseRetType();
      while (this.eat(".")) tp = this.extendRetType(tp);
      return tp;
    }
  };

  function parseType(spec, name, base, forceNew) {
    var type = new TypeParser(spec, null, base, forceNew).parseType(name, true);
    if (/^fn\(/.test(spec)) for (var i = 0; i < type.args.length; ++i) (function(i) {
      var arg = type.args[i];
      if (arg instanceof infer.Fn && arg.args && arg.args.length) addEffect(type, function(_self, fArgs) {
        var fArg = fArgs[i];
        if (fArg) fArg.propagate(new infer.IsCallee(infer.cx().topScope, arg.args, null, infer.ANull));
      });
    })(i);
    return type;
  }

  function addEffect(fn, handler, replaceRet) {
    var oldCmp = fn.computeRet, rv = fn.retval;
    fn.computeRet = function(self, args, argNodes) {
      var handled = handler(self, args, argNodes);
      var old = oldCmp ? oldCmp(self, args, argNodes) : rv;
      return replaceRet ? handled : old;
    };
  }

  var parseEffect = exports.parseEffect = function(effect, fn) {
    var m;
    if (effect.indexOf("propagate ") == 0) {
      var p = new TypeParser(effect, 10);
      var getOrigin = p.parseRetType();
      if (!p.eat(" ")) p.error();
      var getTarget = p.parseRetType();
      addEffect(fn, function(self, args) {
        getOrigin(self, args).propagate(getTarget(self, args));
      });
    } else if (effect.indexOf("call ") == 0) {
      var andRet = effect.indexOf("and return ", 5) == 5;
      var p = new TypeParser(effect, andRet ? 16 : 5);
      var getCallee = p.parseRetType(), getSelf = null, getArgs = [];
      if (p.eat(" this=")) getSelf = p.parseRetType();
      while (p.eat(" ")) getArgs.push(p.parseRetType());
      addEffect(fn, function(self, args) {
        var callee = getCallee(self, args);
        var slf = getSelf ? getSelf(self, args) : infer.ANull, as = [];
        for (var i = 0; i < getArgs.length; ++i) as.push(getArgs[i](self, args));
        var result = andRet ? new infer.AVal : infer.ANull;
        callee.propagate(new infer.IsCallee(slf, as, null, result));
        return result;
      }, andRet);
    } else if (m = effect.match(/^custom (\S+)\s*(.*)/)) {
      var customFunc = customFunctions[m[1]];
      if (customFunc) addEffect(fn, m[2] ? customFunc(m[2]) : customFunc);
    } else if (effect.indexOf("copy ") == 0) {
      var p = new TypeParser(effect, 5);
      var getFrom = p.parseRetType();
      p.eat(" ");
      var getTo = p.parseRetType();
      addEffect(fn, function(self, args) {
        var from = getFrom(self, args), to = getTo(self, args);
        from.forAllProps(function(prop, val, local) {
          if (local && prop != "<i>")
            to.propagate(new infer.PropHasSubset(prop, val));
        });
      });
    } else {
      throw new Error("Unknown effect type: " + effect);
    }
  };

  var currentTopScope;

  var parsePath = exports.parsePath = function(path, scope) {
    var cx = infer.cx(), cached = cx.paths[path], origPath = path;
    if (cached != null) return cached;
    cx.paths[path] = infer.ANull;

    var base = scope || currentTopScope || cx.topScope;

    if (cx.localDefs) for (var name in cx.localDefs) {
      if (path.indexOf(name) == 0) {
        if (path == name) return cx.paths[path] = cx.localDefs[path];
        if (path.charAt(name.length) == ".") {
          base = cx.localDefs[name];
          path = path.slice(name.length + 1);
          break;
        }
      }
    }

    var parts = path.split(".");
    for (var i = 0; i < parts.length && base != infer.ANull; ++i) {
      var prop = parts[i];
      if (prop.charAt(0) == "!") {
        if (prop == "!proto") {
          base = (base instanceof infer.Obj && base.proto) || infer.ANull;
        } else {
          var fn = base.getFunctionType();
          if (!fn) {
            base = infer.ANull;
          } else if (prop == "!ret") {
            base = fn.retval && fn.retval.getType(false) || infer.ANull;
          } else {
            var arg = fn.args && fn.args[Number(prop.slice(1))];
            base = (arg && arg.getType(false)) || infer.ANull;
          }
        }
      } else if (base instanceof infer.Obj) {
        var propVal = (prop == "prototype" && base instanceof infer.Fn) ? base.getProp(prop) : base.props[prop];
        if (!propVal || propVal.isEmpty())
          base = infer.ANull;
        else
          base = propVal.types[0];
      }
    }
    // Uncomment this to get feedback on your poorly written .json files
    // if (base == infer.ANull) console.error("bad path: " + origPath + " (" + cx.curOrigin + ")");
    cx.paths[origPath] = base == infer.ANull ? null : base;
    return base;
  };

  function emptyObj(ctor) {
    var empty = Object.create(ctor.prototype);
    empty.props = Object.create(null);
    empty.isShell = true;
    return empty;
  }

  function isSimpleAnnotation(spec) {
    if (!spec["!type"] || /^(fn\(|\[)/.test(spec["!type"])) return false;
    for (var prop in spec)
      if (prop != "!type" && prop != "!doc" && prop != "!url" && prop != "!span" && prop != "!data")
        return false;
    return true;
  }

  function passOne(base, spec, path) {
    if (!base) {
      var tp = spec["!type"];
      if (tp) {
        if (/^fn\(/.test(tp)) base = emptyObj(infer.Fn);
        else if (tp.charAt(0) == "[") base = emptyObj(infer.Arr);
        else throw new Error("Invalid !type spec: " + tp);
      } else if (spec["!stdProto"]) {
        base = infer.cx().protos[spec["!stdProto"]];
      } else {
        base = emptyObj(infer.Obj);
      }
      base.name = path;
    }

    for (var name in spec) if (hop(spec, name) && name.charCodeAt(0) != 33) {
      var inner = spec[name];
      if (typeof inner == "string" || isSimpleAnnotation(inner)) continue;
      var prop = base.defProp(name);
      passOne(prop.getObjType(), inner, path ? path + "." + name : name).propagate(prop);
    }
    return base;
  }

  function passTwo(base, spec, path) {
    if (base.isShell) {
      delete base.isShell;
      var tp = spec["!type"];
      if (tp) {
        parseType(tp, path, base);
      } else {
        var proto = spec["!proto"] && parseType(spec["!proto"]);
        infer.Obj.call(base, proto instanceof infer.Obj ? proto : true, path);
      }
    }

    var effects = spec["!effects"];
    if (effects && base instanceof infer.Fn) for (var i = 0; i < effects.length; ++i)
      parseEffect(effects[i], base);
    copyInfo(spec, base);

    for (var name in spec) if (hop(spec, name) && name.charCodeAt(0) != 33) {
      var inner = spec[name], known = base.defProp(name), innerPath = path ? path + "." + name : name;
      if (typeof inner == "string") {
        if (known.isEmpty()) parseType(inner, innerPath).propagate(known);
      } else {
        if (!isSimpleAnnotation(inner))
          passTwo(known.getObjType(), inner, innerPath);
        else if (known.isEmpty())
          parseType(inner["!type"], innerPath, null, true).propagate(known);
        else
          continue;
        if (inner["!doc"]) known.doc = inner["!doc"];
        if (inner["!url"]) known.url = inner["!url"];
        if (inner["!span"]) known.span = inner["!span"];
      }
    }
    return base;
  }

  function copyInfo(spec, type) {
    if (spec["!doc"]) type.doc = spec["!doc"];
    if (spec["!url"]) type.url = spec["!url"];
    if (spec["!span"]) type.span = spec["!span"];
    if (spec["!data"]) type.metaData = spec["!data"];
  }

  function runPasses(type, arg) {
    var parent = infer.cx().parent, pass = parent && parent.passes && parent.passes[type];
    if (pass) for (var i = 0; i < pass.length; i++) pass[i](arg);
  }

  function doLoadEnvironment(data, scope) {
    var cx = infer.cx();

    infer.addOrigin(cx.curOrigin = data["!name"] || "env#" + cx.origins.length);
    cx.localDefs = cx.definitions[cx.curOrigin] = Object.create(null);

    runPasses("preLoadDef", data);

    passOne(scope, data);

    var def = data["!define"];
    if (def) {
      for (var name in def) {
        var spec = def[name];
        cx.localDefs[name] = typeof spec == "string" ? parsePath(spec) : passOne(null, spec, name);
      }
      for (var name in def) {
        var spec = def[name];
        if (typeof spec != "string") passTwo(cx.localDefs[name], def[name], name);
      }
    }

    passTwo(scope, data);

    runPasses("postLoadDef", data);

    cx.curOrigin = cx.localDefs = null;
  }

  exports.load = function(data, scope) {
    if (!scope) scope = infer.cx().topScope;
    var oldScope = currentTopScope;
    currentTopScope = scope;
    try {
      doLoadEnvironment(data, scope);
    } finally {
      currentTopScope = oldScope;
    }
  };

  exports.parse = function(data, origin, path) {
    var cx = infer.cx();
    if (origin) {
      cx.origin = origin;
      cx.localDefs = cx.definitions[origin];
    }

    try {
      if (typeof data == "string")
        return parseType(data, path);
      else
        return passTwo(passOne(null, data, path), data, path);
    } finally {
      if (origin) cx.origin = cx.localDefs = null;
    }
  };

  // Used to register custom logic for more involved effect or type
  // computation.
  var customFunctions = Object.create(null);
  infer.registerFunction = function(name, f) { customFunctions[name] = f; };

  var IsCreated = infer.constraint("created, target, spec", {
    addType: function(tp) {
      if (tp instanceof infer.Obj && this.created++ < 5) {
        var derived = new infer.Obj(tp), spec = this.spec;
        if (spec instanceof infer.AVal) spec = spec.getObjType(false);
        if (spec instanceof infer.Obj) for (var prop in spec.props) {
          var cur = spec.props[prop].types[0];
          var p = derived.defProp(prop);
          if (cur && cur instanceof infer.Obj && cur.props.value) {
            var vtp = cur.props.value.getType(false);
            if (vtp) p.addType(vtp);
          }
        }
        this.target.addType(derived);
      }
    }
  });

  infer.registerFunction("Object_create", function(_self, args, argNodes) {
    if (argNodes && argNodes.length && argNodes[0].type == "Literal" && argNodes[0].value == null)
      return new infer.Obj();

    var result = new infer.AVal;
    if (args[0]) args[0].propagate(new IsCreated(0, result, args[1]));
    return result;
  });

  var PropSpec = infer.constraint("target", {
    addType: function(tp) {
      if (!(tp instanceof infer.Obj)) return;
      if (tp.hasProp("value"))
        tp.getProp("value").propagate(this.target);
      else if (tp.hasProp("get"))
        tp.getProp("get").propagate(new infer.IsCallee(infer.ANull, [], null, this.target));
    }
  });

  infer.registerFunction("Object_defineProperty", function(_self, args, argNodes) {
    if (argNodes && argNodes.length >= 3 && argNodes[1].type == "Literal" &&
        typeof argNodes[1].value == "string") {
      var obj = args[0], connect = new infer.AVal;
      obj.propagate(new infer.PropHasSubset(argNodes[1].value, connect, argNodes[1]));
      args[2].propagate(new PropSpec(connect));
    }
    return infer.ANull;
  });

  var IsBound = infer.constraint("self, args, target", {
    addType: function(tp) {
      if (!(tp instanceof infer.Fn)) return;
      this.target.addType(new infer.Fn(tp.name, tp.self, tp.args.slice(this.args.length),
                                       tp.argNames.slice(this.args.length), tp.retval));
      this.self.propagate(tp.self);
      for (var i = 0; i < Math.min(tp.args.length, this.args.length); ++i)
        this.args[i].propagate(tp.args[i]);
    }
  });

  infer.registerFunction("Function_bind", function(self, args) {
    if (!args.length) return infer.ANull;
    var result = new infer.AVal;
    self.propagate(new IsBound(args[0], args.slice(1), result));
    return result;
  });

  infer.registerFunction("Array_ctor", function(_self, args) {
    var arr = new infer.Arr;
    if (args.length != 1 || !args[0].hasType(infer.cx().num)) {
      var content = arr.getProp("<i>");
      for (var i = 0; i < args.length; ++i) args[i].propagate(content);
    }
    return arr;
  });

  infer.registerFunction("Promise_ctor", function(_self, args, argNodes) {
    if (args.length < 1) return infer.ANull;
    var self = new infer.Obj(infer.cx().definitions.ecma6["Promise.prototype"]);
    var valProp = self.defProp("value", argNodes && argNodes[0]);
    var valArg = new infer.AVal;
    valArg.propagate(valProp);
    var exec = new infer.Fn("execute", infer.ANull, [valArg], ["value"], infer.ANull);
    var reject = infer.cx().definitions.ecma6.promiseReject;
    args[0].propagate(new infer.IsCallee(infer.ANull, [exec, reject], null, infer.ANull));
    return self;
  });

  return exports;
});

//#endregion


//#region tern/lib/infer.js

// Main type inference engine

// Walks an AST, building up a graph of abstract values and constraints
// that cause types to flow from one node to another. Also defines a
// number of utilities for accessing ASTs and scopes.

// Analysis is done in a context, which is tracked by the dynamically
// bound cx variable. Use withContext to set the current context.

// For memory-saving reasons, individual types export an interface
// similar to abstract values (which can hold multiple types), and can
// thus be used in place abstract values that only ever contain a
// single type.

(function(root, mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(exports, require("acorn/acorn"), require("acorn/acorn_loose"), require("acorn/util/walk"),
               require("./def"), require("./signal"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["exports", "acorn/acorn", "acorn/acorn_loose", "acorn/util/walk", "./def", "./signal"], mod);
  mod(root.tern || (root.tern = {}), acorn, acorn, acorn.walk, tern.def, tern.signal); // Plain browser env
})(this, function(exports, acorn, acorn_loose, walk, def, signal) {
  "use strict";

  var toString = exports.toString = function(type, maxDepth, parent) {
    return !type || type == parent ? "?": type.toString(maxDepth, parent);
  };

  // A variant of AVal used for unknown, dead-end values. Also serves
  // as prototype for AVals, Types, and Constraints because it
  // implements 'empty' versions of all the methods that the code
  // expects.
  var ANull = exports.ANull = signal.mixin({
    addType: function() {},
    propagate: function() {},
    getProp: function() { return ANull; },
    forAllProps: function() {},
    hasType: function() { return false; },
    isEmpty: function() { return true; },
    getFunctionType: function() {},
    getObjType: function() {},
    getType: function() {},
    gatherProperties: function() {},
    propagatesTo: function() {},
    typeHint: function() {},
    propHint: function() {},
    toString: function() { return "?"; }
  });

  function extend(proto, props) {
    var obj = Object.create(proto);
    if (props) for (var prop in props) obj[prop] = props[prop];
    return obj;
  }

  // ABSTRACT VALUES

  var WG_DEFAULT = 100, WG_NEW_INSTANCE = 90, WG_MADEUP_PROTO = 10, WG_MULTI_MEMBER = 5,
      WG_CATCH_ERROR = 5, WG_GLOBAL_THIS = 90, WG_SPECULATIVE_THIS = 2;

  var AVal = exports.AVal = function() {
    this.types = [];
    this.forward = null;
    this.maxWeight = 0;
  };
  AVal.prototype = extend(ANull, {
    addType: function(type, weight) {
      weight = weight || WG_DEFAULT;
      if (this.maxWeight < weight) {
        this.maxWeight = weight;
        if (this.types.length == 1 && this.types[0] == type) return;
        this.types.length = 0;
      } else if (this.maxWeight > weight || this.types.indexOf(type) > -1) {
        return;
      }

      this.signal("addType", type);
      this.types.push(type);
      var forward = this.forward;
      if (forward) withWorklist(function(add) {
        for (var i = 0; i < forward.length; ++i) add(type, forward[i], weight);
      });
    },

    propagate: function(target, weight) {
      if (target == ANull || (target instanceof Type)) return;
      if (weight && weight != WG_DEFAULT) target = new Muffle(target, weight);
      (this.forward || (this.forward = [])).push(target);
      var types = this.types;
      if (types.length) withWorklist(function(add) {
        for (var i = 0; i < types.length; ++i) add(types[i], target, weight);
      });
    },

    getProp: function(prop) {
      if (prop == "__proto__" || prop == "✖") return ANull;
      var found = (this.props || (this.props = Object.create(null)))[prop];
      if (!found) {
        found = this.props[prop] = new AVal;
        this.propagate(new PropIsSubset(prop, found));
      }
      return found;
    },

    forAllProps: function(c) {
      this.propagate(new ForAllProps(c));
    },

    hasType: function(type) {
      return this.types.indexOf(type) > -1;
    },
    isEmpty: function() { return this.types.length === 0; },
    getFunctionType: function() {
      for (var i = this.types.length - 1; i >= 0; --i)
        if (this.types[i] instanceof Fn) return this.types[i];
    },
    getObjType: function() {
      var seen = null;
      for (var i = this.types.length - 1; i >= 0; --i) {
        var type = this.types[i];
        if (!(type instanceof Obj)) continue;
        if (type.name) return type;
        if (!seen) seen = type;
      }
      return seen;
    },

    getType: function(guess) {
      if (this.types.length === 0 && guess !== false) return this.makeupType();
      if (this.types.length === 1) return this.types[0];
      return canonicalType(this.types);
    },

    toString: function(maxDepth, parent) {
      if (this.types.length == 0) return toString(this.makeupType(), maxDepth, parent);
      if (this.types.length == 1) return toString(this.types[0], maxDepth, parent);
      var simplified = simplifyTypes(this.types);
      if (simplified.length > 2) return "?";
      return simplified.map(function(tp) { return toString(tp, maxDepth, parent); }).join("|");
    },

    computedPropType: function() {
      if (!this.propertyOf || !this.propertyOf.hasProp("<i>")) return null;
      var computedProp = this.propertyOf.getProp("<i>");
      if (computedProp == this) return null;
      return computedProp.getType();
    },

    makeupType: function() {
      var computed = this.computedPropType();
      if (computed) return computed;

      if (!this.forward) return null;
      for (var i = this.forward.length - 1; i >= 0; --i) {
        var hint = this.forward[i].typeHint();
        if (hint && !hint.isEmpty()) {guessing = true; return hint;}
      }

      var props = Object.create(null), foundProp = null;
      for (var i = 0; i < this.forward.length; ++i) {
        var prop = this.forward[i].propHint();
        if (prop && prop != "length" && prop != "<i>" && prop != "✖" && prop != cx.completingProperty) {
          props[prop] = true;
          foundProp = prop;
        }
      }
      if (!foundProp) return null;

      var objs = objsWithProp(foundProp);
      if (objs) {
        var matches = [];
        search: for (var i = 0; i < objs.length; ++i) {
          var obj = objs[i];
          for (var prop in props) if (!obj.hasProp(prop)) continue search;
          if (obj.hasCtor) obj = getInstance(obj);
          matches.push(obj);
        }
        var canon = canonicalType(matches);
        if (canon) {guessing = true; return canon;}
      }
    },

    typeHint: function() { return this.types.length ? this.getType() : null; },
    propagatesTo: function() { return this; },

    gatherProperties: function(f, depth) {
      for (var i = 0; i < this.types.length; ++i)
        this.types[i].gatherProperties(f, depth);
    },

    guessProperties: function(f) {
      if (this.forward) for (var i = 0; i < this.forward.length; ++i) {
        var prop = this.forward[i].propHint();
        if (prop) f(prop, null, 0);
      }
      var guessed = this.makeupType();
      if (guessed) guessed.gatherProperties(f);
    }
  });

  function similarAVal(a, b, depth) {
    var typeA = a.getType(false), typeB = b.getType(false);
    if (!typeA || !typeB) return true;
    return similarType(typeA, typeB, depth);
  }

  function similarType(a, b, depth) {
    if (!a || depth >= 5) return b;
    if (!a || a == b) return a;
    if (!b) return a;
    if (a.constructor != b.constructor) return false;
    if (a.constructor == Arr) {
      var innerA = a.getProp("<i>").getType(false);
      if (!innerA) return b;
      var innerB = b.getProp("<i>").getType(false);
      if (!innerB || similarType(innerA, innerB, depth + 1)) return b;
    } else if (a.constructor == Obj) {
      var propsA = 0, propsB = 0, same = 0;
      for (var prop in a.props) {
        propsA++;
        if (prop in b.props && similarAVal(a.props[prop], b.props[prop], depth + 1))
          same++;
      }
      for (var prop in b.props) propsB++;
      if (propsA && propsB && same < Math.max(propsA, propsB) / 2) return false;
      return propsA > propsB ? a : b;
    } else if (a.constructor == Fn) {
      if (a.args.length != b.args.length ||
          !a.args.every(function(tp, i) { return similarAVal(tp, b.args[i], depth + 1); }) ||
          !similarAVal(a.retval, b.retval, depth + 1) || !similarAVal(a.self, b.self, depth + 1))
        return false;
      return a;
    } else {
      return false;
    }
  }

  var simplifyTypes = exports.simplifyTypes = function(types) {
    var found = [];
    outer: for (var i = 0; i < types.length; ++i) {
      var tp = types[i];
      for (var j = 0; j < found.length; j++) {
        var similar = similarType(tp, found[j], 0);
        if (similar) {
          found[j] = similar;
          continue outer;
        }
      }
      found.push(tp);
    }
    return found;
  };

  function canonicalType(types) {
    var arrays = 0, fns = 0, objs = 0, prim = null;
    for (var i = 0; i < types.length; ++i) {
      var tp = types[i];
      if (tp instanceof Arr) ++arrays;
      else if (tp instanceof Fn) ++fns;
      else if (tp instanceof Obj) ++objs;
      else if (tp instanceof Prim) {
        if (prim && tp.name != prim.name) return null;
        prim = tp;
      }
    }
    var kinds = (arrays && 1) + (fns && 1) + (objs && 1) + (prim && 1);
    if (kinds > 1) return null;
    if (prim) return prim;

    var maxScore = 0, maxTp = null;
    for (var i = 0; i < types.length; ++i) {
      var tp = types[i], score = 0;
      if (arrays) {
        score = tp.getProp("<i>").isEmpty() ? 1 : 2;
      } else if (fns) {
        score = 1;
        for (var j = 0; j < tp.args.length; ++j) if (!tp.args[j].isEmpty()) ++score;
        if (!tp.retval.isEmpty()) ++score;
      } else if (objs) {
        score = tp.name ? 100 : 2;
      }
      if (score >= maxScore) { maxScore = score; maxTp = tp; }
    }
    return maxTp;
  }

  // PROPAGATION STRATEGIES

  function Constraint() {}
  Constraint.prototype = extend(ANull, {
    init: function() { this.origin = cx.curOrigin; }
  });

  var constraint = exports.constraint = function(props, methods) {
    var body = "this.init();";
    props = props ? props.split(", ") : [];
    for (var i = 0; i < props.length; ++i)
      body += "this." + props[i] + " = " + props[i] + ";";
    var ctor = Function.apply(null, props.concat([body]));
    ctor.prototype = Object.create(Constraint.prototype);
    for (var m in methods) if (methods.hasOwnProperty(m)) ctor.prototype[m] = methods[m];
    return ctor;
  };

  var PropIsSubset = constraint("prop, target", {
    addType: function(type, weight) {
      if (type.getProp)
        type.getProp(this.prop).propagate(this.target, weight);
    },
    propHint: function() { return this.prop; },
    propagatesTo: function() {
      if (this.prop == "<i>" || !/[^\w_]/.test(this.prop))
        return {target: this.target, pathExt: "." + this.prop};
    }
  });

  var PropHasSubset = exports.PropHasSubset = constraint("prop, type, originNode", {
    addType: function(type, weight) {
      if (!(type instanceof Obj)) return;
      var prop = type.defProp(this.prop, this.originNode);
      prop.origin = this.origin;
      this.type.propagate(prop, weight);
    },
    propHint: function() { return this.prop; }
  });

  var ForAllProps = constraint("c", {
    addType: function(type) {
      if (!(type instanceof Obj)) return;
      type.forAllProps(this.c);
    }
  });

  function withDisabledComputing(fn, body) {
    cx.disabledComputing = {fn: fn, prev: cx.disabledComputing};
    try {
      return body();
    } finally {
      cx.disabledComputing = cx.disabledComputing.prev;
    }
  }
  var IsCallee = exports.IsCallee = constraint("self, args, argNodes, retval", {
    init: function() {
      Constraint.prototype.init.call(this);
      this.disabled = cx.disabledComputing;
    },
    addType: function(fn, weight) {
      if (!(fn instanceof Fn)) return;
      for (var i = 0; i < this.args.length; ++i) {
        if (i < fn.args.length) this.args[i].propagate(fn.args[i], weight);
        if (fn.arguments) this.args[i].propagate(fn.arguments, weight);
      }
      this.self.propagate(fn.self, this.self == cx.topScope ? WG_GLOBAL_THIS : weight);
      var compute = fn.computeRet;
      if (compute) for (var d = this.disabled; d; d = d.prev)
        if (d.fn == fn || fn.originNode && d.fn.originNode == fn.originNode) compute = null;
      if (compute)
        compute(this.self, this.args, this.argNodes).propagate(this.retval, weight);
      else
        fn.retval.propagate(this.retval, weight);
    },
    typeHint: function() {
      var names = [];
      for (var i = 0; i < this.args.length; ++i) names.push("?");
      return new Fn(null, this.self, this.args, names, ANull);
    },
    propagatesTo: function() {
      return {target: this.retval, pathExt: ".!ret"};
    }
  });

  var HasMethodCall = constraint("propName, args, argNodes, retval", {
    init: function() {
      Constraint.prototype.init.call(this);
      this.disabled = cx.disabledComputing;
    },
    addType: function(obj, weight) {
      var callee = new IsCallee(obj, this.args, this.argNodes, this.retval);
      callee.disabled = this.disabled;
      obj.getProp(this.propName).propagate(callee, weight);
    },
    propHint: function() { return this.propName; }
  });

  var IsCtor = exports.IsCtor = constraint("target, noReuse", {
    addType: function(f, weight) {
      if (!(f instanceof Fn)) return;
      if (cx.parent && !cx.parent.options.reuseInstances) this.noReuse = true;
      f.getProp("prototype").propagate(new IsProto(this.noReuse ? false : f, this.target), weight);
    }
  });

  var getInstance = exports.getInstance = function(obj, ctor) {
    if (ctor === false) return new Obj(obj);

    if (!ctor) ctor = obj.hasCtor;
    if (!obj.instances) obj.instances = [];
    for (var i = 0; i < obj.instances.length; ++i) {
      var cur = obj.instances[i];
      if (cur.ctor == ctor) return cur.instance;
    }
    var instance = new Obj(obj, ctor && ctor.name);
    instance.origin = obj.origin;
    obj.instances.push({ctor: ctor, instance: instance});
    return instance;
  };

  var IsProto = exports.IsProto = constraint("ctor, target", {
    addType: function(o, _weight) {
      if (!(o instanceof Obj)) return;
      if ((this.count = (this.count || 0) + 1) > 8) return;
      if (o == cx.protos.Array)
        this.target.addType(new Arr);
      else
        this.target.addType(getInstance(o, this.ctor));
    }
  });

  var FnPrototype = constraint("fn", {
    addType: function(o, _weight) {
      if (o instanceof Obj && !o.hasCtor) {
        o.hasCtor = this.fn;
        var adder = new SpeculativeThis(o, this.fn);
        adder.addType(this.fn);
        o.forAllProps(function(_prop, val, local) {
          if (local) val.propagate(adder);
        });
      }
    }
  });

  var IsAdded = constraint("other, target", {
    addType: function(type, weight) {
      if (type == cx.str)
        this.target.addType(cx.str, weight);
      else if (type == cx.num && this.other.hasType(cx.num))
        this.target.addType(cx.num, weight);
    },
    typeHint: function() { return this.other; }
  });

  var IfObj = exports.IfObj = constraint("target", {
    addType: function(t, weight) {
      if (t instanceof Obj) this.target.addType(t, weight);
    },
    propagatesTo: function() { return this.target; }
  });

  var SpeculativeThis = constraint("obj, ctor", {
    addType: function(tp) {
      if (tp instanceof Fn && tp.self && tp.self.isEmpty())
        tp.self.addType(getInstance(this.obj, this.ctor), WG_SPECULATIVE_THIS);
    }
  });

  var Muffle = constraint("inner, weight", {
    addType: function(tp, weight) {
      this.inner.addType(tp, Math.min(weight, this.weight));
    },
    propagatesTo: function() { return this.inner.propagatesTo(); },
    typeHint: function() { return this.inner.typeHint(); },
    propHint: function() { return this.inner.propHint(); }
  });

  // TYPE OBJECTS

  var Type = exports.Type = function() {};
  Type.prototype = extend(ANull, {
    constructor: Type,
    propagate: function(c, w) { c.addType(this, w); },
    hasType: function(other) { return other == this; },
    isEmpty: function() { return false; },
    typeHint: function() { return this; },
    getType: function() { return this; }
  });

  var Prim = exports.Prim = function(proto, name) { this.name = name; this.proto = proto; };
  Prim.prototype = extend(Type.prototype, {
    constructor: Prim,
    toString: function() { return this.name; },
    getProp: function(prop) {return this.proto.hasProp(prop) || ANull;},
    gatherProperties: function(f, depth) {
      if (this.proto) this.proto.gatherProperties(f, depth);
    }
  });

  var Obj = exports.Obj = function(proto, name) {
    if (!this.props) this.props = Object.create(null);
    this.proto = proto === true ? cx.protos.Object : proto;
    if (proto && !name && proto.name && !(this instanceof Fn)) {
      var match = /^(.*)\.prototype$/.exec(this.proto.name);
      if (match) name = match[1];
    }
    this.name = name;
    this.maybeProps = null;
    this.origin = cx.curOrigin;
  };
  Obj.prototype = extend(Type.prototype, {
    constructor: Obj,
    toString: function(maxDepth) {
      if (!maxDepth && this.name) return this.name;
      var props = [], etc = false;
      for (var prop in this.props) if (prop != "<i>") {
        if (props.length > 5) { etc = true; break; }
        if (maxDepth)
          props.push(prop + ": " + toString(this.props[prop], maxDepth - 1));
        else
          props.push(prop);
      }
      props.sort();
      if (etc) props.push("...");
      return "{" + props.join(", ") + "}";
    },
    hasProp: function(prop, searchProto) {
      var found = this.props[prop];
      if (searchProto !== false)
        for (var p = this.proto; p && !found; p = p.proto) found = p.props[prop];
      return found;
    },
    defProp: function(prop, originNode) {
      var found = this.hasProp(prop, false);
      if (found) {
        if (originNode && !found.originNode) found.originNode = originNode;
        return found;
      }
      if (prop == "__proto__" || prop == "✖") return ANull;

      var av = this.maybeProps && this.maybeProps[prop];
      if (av) {
        delete this.maybeProps[prop];
        this.maybeUnregProtoPropHandler();
      } else {
        av = new AVal;
        av.propertyOf = this;
      }

      this.props[prop] = av;
      av.originNode = originNode;
      av.origin = cx.curOrigin;
      this.broadcastProp(prop, av, true);
      return av;
    },
    getProp: function(prop) {
      var found = this.hasProp(prop, true) || (this.maybeProps && this.maybeProps[prop]);
      if (found) return found;
      if (prop == "__proto__" || prop == "✖") return ANull;
      var av = this.ensureMaybeProps()[prop] = new AVal;
      av.propertyOf = this;
      return av;
    },
    broadcastProp: function(prop, val, local) {
      if (local) {
        this.signal("addProp", prop, val);
        // If this is a scope, it shouldn't be registered
        if (!(this instanceof Scope)) registerProp(prop, this);
      }

      if (this.onNewProp) for (var i = 0; i < this.onNewProp.length; ++i) {
        var h = this.onNewProp[i];
        h.onProtoProp ? h.onProtoProp(prop, val, local) : h(prop, val, local);
      }
    },
    onProtoProp: function(prop, val, _local) {
      var maybe = this.maybeProps && this.maybeProps[prop];
      if (maybe) {
        delete this.maybeProps[prop];
        this.maybeUnregProtoPropHandler();
        this.proto.getProp(prop).propagate(maybe);
      }
      this.broadcastProp(prop, val, false);
    },
    ensureMaybeProps: function() {
      if (!this.maybeProps) {
        if (this.proto) this.proto.forAllProps(this);
        this.maybeProps = Object.create(null);
      }
      return this.maybeProps;
    },
    removeProp: function(prop) {
      var av = this.props[prop];
      delete this.props[prop];
      this.ensureMaybeProps()[prop] = av;
      av.types.length = 0;
    },
    forAllProps: function(c) {
      if (!this.onNewProp) {
        this.onNewProp = [];
        if (this.proto) this.proto.forAllProps(this);
      }
      this.onNewProp.push(c);
      for (var o = this; o; o = o.proto) for (var prop in o.props) {
        if (c.onProtoProp)
          c.onProtoProp(prop, o.props[prop], o == this);
        else
          c(prop, o.props[prop], o == this);
      }
    },
    maybeUnregProtoPropHandler: function() {
      if (this.maybeProps) {
        for (var _n in this.maybeProps) return;
        this.maybeProps = null;
      }
      if (!this.proto || this.onNewProp && this.onNewProp.length) return;
      this.proto.unregPropHandler(this);
    },
    unregPropHandler: function(handler) {
      for (var i = 0; i < this.onNewProp.length; ++i)
        if (this.onNewProp[i] == handler) { this.onNewProp.splice(i, 1); break; }
      this.maybeUnregProtoPropHandler();
    },
    gatherProperties: function(f, depth) {
      for (var prop in this.props) if (prop != "<i>")
        f(prop, this, depth);
      if (this.proto) this.proto.gatherProperties(f, depth + 1);
    },
    getObjType: function() { return this; }
  });

  var Fn = exports.Fn = function(name, self, args, argNames, retval) {
    Obj.call(this, cx.protos.Function, name);
    this.self = self;
    this.args = args;
    this.argNames = argNames;
    this.retval = retval;
  };
  Fn.prototype = extend(Obj.prototype, {
    constructor: Fn,
    toString: function(maxDepth) {
      if (maxDepth) maxDepth--;
      var str = "fn(";
      for (var i = 0; i < this.args.length; ++i) {
        if (i) str += ", ";
        var name = this.argNames[i];
        if (name && name != "?") str += name + ": ";
        str += toString(this.args[i], maxDepth, this);
      }
      str += ")";
      if (!this.retval.isEmpty())
        str += " -> " + toString(this.retval, maxDepth, this);
      return str;
    },
    getProp: function(prop) {
      if (prop == "prototype") {
        var known = this.hasProp(prop, false);
        if (!known) {
          known = this.defProp(prop);
          var proto = new Obj(true, this.name && this.name + ".prototype");
          proto.origin = this.origin;
          known.addType(proto, WG_MADEUP_PROTO);
        }
        return known;
      }
      return Obj.prototype.getProp.call(this, prop);
    },
    defProp: function(prop, originNode) {
      if (prop == "prototype") {
        var found = this.hasProp(prop, false);
        if (found) return found;
        found = Obj.prototype.defProp.call(this, prop, originNode);
        found.origin = this.origin;
        found.propagate(new FnPrototype(this));
        return found;
      }
      return Obj.prototype.defProp.call(this, prop, originNode);
    },
    getFunctionType: function() { return this; }
  });

  var Arr = exports.Arr = function(contentType) {
    Obj.call(this, cx.protos.Array);
    var content = this.defProp("<i>");
    if (contentType) contentType.propagate(content);
  };
  Arr.prototype = extend(Obj.prototype, {
    constructor: Arr,
    toString: function(maxDepth) {
      return "[" + toString(this.getProp("<i>"), maxDepth, this) + "]";
    }
  });

  // THE PROPERTY REGISTRY

  function registerProp(prop, obj) {
    var data = cx.props[prop] || (cx.props[prop] = []);
    data.push(obj);
  }

  function objsWithProp(prop) {
    return cx.props[prop];
  }

  // INFERENCE CONTEXT

  exports.Context = function(defs, parent) {
    this.parent = parent;
    this.props = Object.create(null);
    this.protos = Object.create(null);
    this.origins = [];
    this.curOrigin = "ecma5";
    this.paths = Object.create(null);
    this.definitions = Object.create(null);
    this.purgeGen = 0;
    this.workList = null;
    this.disabledComputing = null;

    exports.withContext(this, function() {
      cx.protos.Object = new Obj(null, "Object.prototype");
      cx.topScope = new Scope();
      cx.topScope.name = "<top>";
      cx.protos.Array = new Obj(true, "Array.prototype");
      cx.protos.Function = new Obj(true, "Function.prototype");
      cx.protos.RegExp = new Obj(true, "RegExp.prototype");
      cx.protos.String = new Obj(true, "String.prototype");
      cx.protos.Number = new Obj(true, "Number.prototype");
      cx.protos.Boolean = new Obj(true, "Boolean.prototype");
      cx.str = new Prim(cx.protos.String, "string");
      cx.bool = new Prim(cx.protos.Boolean, "bool");
      cx.num = new Prim(cx.protos.Number, "number");
      cx.curOrigin = null;

      if (defs) for (var i = 0; i < defs.length; ++i)
        def.load(defs[i]);
    });
  };

  var cx = null;
  exports.cx = function() { return cx; };

  exports.withContext = function(context, f) {
    var old = cx;
    cx = context;
    try { return f(); }
    finally { cx = old; }
  };

  exports.TimedOut = function() {
    this.message = "Timed out";
    this.stack = (new Error()).stack;
  };
  exports.TimedOut.prototype = Object.create(Error.prototype);
  exports.TimedOut.prototype.name = "infer.TimedOut";

  var timeout;
  exports.withTimeout = function(ms, f) {
    var end = +new Date + ms;
    var oldEnd = timeout;
    if (oldEnd && oldEnd < end) return f();
    timeout = end;
    try { return f(); }
    finally { timeout = oldEnd; }
  };

  exports.addOrigin = function(origin) {
    if (cx.origins.indexOf(origin) < 0) cx.origins.push(origin);
  };

  var baseMaxWorkDepth = 20, reduceMaxWorkDepth = 0.0001;
  function withWorklist(f) {
    if (cx.workList) return f(cx.workList);

    var list = [], depth = 0;
    var add = cx.workList = function(type, target, weight) {
      if (depth < baseMaxWorkDepth - reduceMaxWorkDepth * list.length)
        list.push(type, target, weight, depth);
    };
    try {
      var ret = f(add);
      for (var i = 0; i < list.length; i += 4) {
        if (timeout && +new Date >= timeout)
          throw new exports.TimedOut();
        depth = list[i + 3] + 1;
        list[i + 1].addType(list[i], list[i + 2]);
      }
      return ret;
    } finally {
      cx.workList = null;
    }
  }

  // SCOPES

  var Scope = exports.Scope = function(prev) {
    Obj.call(this, prev || true);
    this.prev = prev;
  };
  Scope.prototype = extend(Obj.prototype, {
    constructor: Scope,
    defVar: function(name, originNode) {
      for (var s = this; ; s = s.proto) {
        var found = s.props[name];
        if (found) return found;
        if (!s.prev) return s.defProp(name, originNode);
      }
    }
  });

  // RETVAL COMPUTATION HEURISTICS

  function maybeInstantiate(scope, score) {
    if (scope.fnType)
      scope.fnType.instantiateScore = (scope.fnType.instantiateScore || 0) + score;
  }

  var NotSmaller = {};
  function nodeSmallerThan(node, n) {
    try {
      walk.simple(node, {Expression: function() { if (--n <= 0) throw NotSmaller; }});
      return true;
    } catch(e) {
      if (e == NotSmaller) return false;
      throw e;
    }
  }

  function maybeTagAsInstantiated(node, scope) {
    var score = scope.fnType.instantiateScore;
    if (!cx.disabledComputing && score && scope.fnType.args.length && nodeSmallerThan(node, score * 5)) {
      maybeInstantiate(scope.prev, score / 2);
      setFunctionInstantiated(node, scope);
      return true;
    } else {
      scope.fnType.instantiateScore = null;
    }
  }

  function setFunctionInstantiated(node, scope) {
    var fn = scope.fnType;
    // Disconnect the arg avals, so that we can add info to them without side effects
    for (var i = 0; i < fn.args.length; ++i) fn.args[i] = new AVal;
    fn.self = new AVal;
    fn.computeRet = function(self, args) {
      // Prevent recursion
      return withDisabledComputing(fn, function() {
        var oldOrigin = cx.curOrigin;
        cx.curOrigin = fn.origin;
        var scopeCopy = new Scope(scope.prev);
        scopeCopy.originNode = scope.originNode;
        for (var v in scope.props) {
          var local = scopeCopy.defProp(v, scope.props[v].originNode);
          for (var i = 0; i < args.length; ++i) if (fn.argNames[i] == v && i < args.length)
            args[i].propagate(local);
        }
        var argNames = fn.argNames.length != args.length ? fn.argNames.slice(0, args.length) : fn.argNames;
        while (argNames.length < args.length) argNames.push("?");
        scopeCopy.fnType = new Fn(fn.name, self, args, argNames, ANull);
        scopeCopy.fnType.originNode = fn.originNode;
        if (fn.arguments) {
          var argset = scopeCopy.fnType.arguments = new AVal;
          scopeCopy.defProp("arguments").addType(new Arr(argset));
          for (var i = 0; i < args.length; ++i) args[i].propagate(argset);
        }
        node.body.scope = scopeCopy;
        walk.recursive(node.body, scopeCopy, null, scopeGatherer);
        walk.recursive(node.body, scopeCopy, null, inferWrapper);
        cx.curOrigin = oldOrigin;
        return scopeCopy.fnType.retval;
      });
    };
  }

  function maybeTagAsGeneric(scope) {
    var fn = scope.fnType, target = fn.retval;
    if (target == ANull) return;
    var targetInner, asArray;
    if (!target.isEmpty() && (targetInner = target.getType()) instanceof Arr)
      target = asArray = targetInner.getProp("<i>");

    function explore(aval, path, depth) {
      if (depth > 3 || !aval.forward) return;
      for (var i = 0; i < aval.forward.length; ++i) {
        var prop = aval.forward[i].propagatesTo();
        if (!prop) continue;
        var newPath = path, dest;
        if (prop instanceof AVal) {
          dest = prop;
        } else if (prop.target instanceof AVal) {
          newPath += prop.pathExt;
          dest = prop.target;
        } else continue;
        if (dest == target) return newPath;
        var found = explore(dest, newPath, depth + 1);
        if (found) return found;
      }
    }

    var foundPath = explore(fn.self, "!this", 0);
    for (var i = 0; !foundPath && i < fn.args.length; ++i)
      foundPath = explore(fn.args[i], "!" + i, 0);

    if (foundPath) {
      if (asArray) foundPath = "[" + foundPath + "]";
      var p = new def.TypeParser(foundPath);
      fn.computeRet = p.parseRetType();
      fn.computeRetSource = foundPath;
      return true;
    }
  }

  // SCOPE GATHERING PASS

  function addVar(scope, nameNode) {
    return scope.defProp(nameNode.name, nameNode);
  }

  var scopeGatherer = walk.make({
    Function: function(node, scope, c) {
      var inner = node.body.scope = new Scope(scope);
      inner.originNode = node;
      var argVals = [], argNames = [];
      for (var i = 0; i < node.params.length; ++i) {
        var param = node.params[i];
        argNames.push(param.name);
        argVals.push(addVar(inner, param));
      }
      inner.fnType = new Fn(node.id && node.id.name, new AVal, argVals, argNames, ANull);
      inner.fnType.originNode = node;
      if (node.id) {
        var decl = node.type == "FunctionDeclaration";
        addVar(decl ? scope : inner, node.id);
      }
      c(node.body, inner, "ScopeBody");
    },
    TryStatement: function(node, scope, c) {
      c(node.block, scope, "Statement");
      if (node.handler) {
        var v = addVar(scope, node.handler.param);
        c(node.handler.body, scope, "ScopeBody");
        var e5 = cx.definitions.ecma5;
        if (e5 && v.isEmpty()) getInstance(e5["Error.prototype"]).propagate(v, WG_CATCH_ERROR);
      }
      if (node.finalizer) c(node.finalizer, scope, "Statement");
    },
    VariableDeclaration: function(node, scope, c) {
      for (var i = 0; i < node.declarations.length; ++i) {
        var decl = node.declarations[i];
        addVar(scope, decl.id);
        if (decl.init) c(decl.init, scope, "Expression");
      }
    }
  });

  // CONSTRAINT GATHERING PASS

  function propName(node, scope, c) {
    var prop = node.property;
    if (!node.computed) return prop.name;
    if (prop.type == "Literal" && typeof prop.value == "string") return prop.value;
    if (c) infer(prop, scope, c, ANull);
    return "<i>";
  }

  function unopResultType(op) {
    switch (op) {
    case "+": case "-": case "~": return cx.num;
    case "!": return cx.bool;
    case "typeof": return cx.str;
    case "void": case "delete": return ANull;
    }
  }
  function binopIsBoolean(op) {
    switch (op) {
    case "==": case "!=": case "===": case "!==": case "<": case ">": case ">=": case "<=":
    case "in": case "instanceof": return true;
    }
  }
  function literalType(node) {
    if (node.regex) return getInstance(cx.protos.RegExp);
    switch (typeof node.value) {
    case "boolean": return cx.bool;
    case "number": return cx.num;
    case "string": return cx.str;
    case "object":
    case "function":
      if (!node.value) return ANull;
      return getInstance(cx.protos.RegExp);
    }
  }

  function ret(f) {
    return function(node, scope, c, out, name) {
      var r = f(node, scope, c, name);
      if (out) r.propagate(out);
      return r;
    };
  }
  function fill(f) {
    return function(node, scope, c, out, name) {
      if (!out) out = new AVal;
      f(node, scope, c, out, name);
      return out;
    };
  }

  var inferExprVisitor = {
    ArrayExpression: ret(function(node, scope, c) {
      var eltval = new AVal;
      for (var i = 0; i < node.elements.length; ++i) {
        var elt = node.elements[i];
        if (elt) infer(elt, scope, c, eltval);
      }
      return new Arr(eltval);
    }),
    ObjectExpression: ret(function(node, scope, c, name) {
      var obj = node.objType = new Obj(true, name);
      obj.originNode = node;

      for (var i = 0; i < node.properties.length; ++i) {
        var prop = node.properties[i], key = prop.key, name;
        if (prop.value.name == "✖") continue;

        if (key.type == "Identifier") {
          name = key.name;
        } else if (typeof key.value == "string") {
          name = key.value;
        }
        if (!name || prop.kind == "set") {
          infer(prop.value, scope, c, ANull);
          continue;
        }

        var val = obj.defProp(name, key), out = val;
        val.initializer = true;
        if (prop.kind == "get")
          out = new IsCallee(obj, [], null, val);
        infer(prop.value, scope, c, out, name);
      }
      return obj;
    }),
    FunctionExpression: ret(function(node, scope, c, name) {
      var inner = node.body.scope, fn = inner.fnType;
      if (name && !fn.name) fn.name = name;
      c(node.body, scope, "ScopeBody");
      maybeTagAsInstantiated(node, inner) || maybeTagAsGeneric(inner);
      if (node.id) inner.getProp(node.id.name).addType(fn);
      return fn;
    }),
    SequenceExpression: ret(function(node, scope, c) {
      for (var i = 0, l = node.expressions.length - 1; i < l; ++i)
        infer(node.expressions[i], scope, c, ANull);
      return infer(node.expressions[l], scope, c);
    }),
    UnaryExpression: ret(function(node, scope, c) {
      infer(node.argument, scope, c, ANull);
      return unopResultType(node.operator);
    }),
    UpdateExpression: ret(function(node, scope, c) {
      infer(node.argument, scope, c, ANull);
      return cx.num;
    }),
    BinaryExpression: ret(function(node, scope, c) {
      if (node.operator == "+") {
        var lhs = infer(node.left, scope, c);
        var rhs = infer(node.right, scope, c);
        if (lhs.hasType(cx.str) || rhs.hasType(cx.str)) return cx.str;
        if (lhs.hasType(cx.num) && rhs.hasType(cx.num)) return cx.num;
        var result = new AVal;
        lhs.propagate(new IsAdded(rhs, result));
        rhs.propagate(new IsAdded(lhs, result));
        return result;
      } else {
        infer(node.left, scope, c, ANull);
        infer(node.right, scope, c, ANull);
        return binopIsBoolean(node.operator) ? cx.bool : cx.num;
      }
    }),
    AssignmentExpression: ret(function(node, scope, c) {
      var rhs, name, pName;
      if (node.left.type == "MemberExpression") {
        pName = propName(node.left, scope, c);
        if (node.left.object.type == "Identifier")
          name = node.left.object.name + "." + pName;
      } else {
        name = node.left.name;
      }

      if (node.operator != "=" && node.operator != "+=") {
        infer(node.right, scope, c, ANull);
        rhs = cx.num;
      } else {
        rhs = infer(node.right, scope, c, null, name);
      }

      if (node.left.type == "MemberExpression") {
        var obj = infer(node.left.object, scope, c);
        if (pName == "prototype") maybeInstantiate(scope, 20);
        if (pName == "<i>") {
          // This is a hack to recognize for/in loops that copy
          // properties, and do the copying ourselves, insofar as we
          // manage, because such loops tend to be relevant for type
          // information.
          var v = node.left.property.name, local = scope.props[v], over = local && local.iteratesOver;
          if (over) {
            maybeInstantiate(scope, 20);
            var fromRight = node.right.type == "MemberExpression" && node.right.computed && node.right.property.name == v;
            over.forAllProps(function(prop, val, local) {
              if (local && prop != "prototype" && prop != "<i>")
                obj.propagate(new PropHasSubset(prop, fromRight ? val : ANull));
            });
            return rhs;
          }
        }
        obj.propagate(new PropHasSubset(pName, rhs, node.left.property));
      } else { // Identifier
        rhs.propagate(scope.defVar(node.left.name, node.left));
      }
      return rhs;
    }),
    LogicalExpression: fill(function(node, scope, c, out) {
      infer(node.left, scope, c, out);
      infer(node.right, scope, c, out);
    }),
    ConditionalExpression: fill(function(node, scope, c, out) {
      infer(node.test, scope, c, ANull);
      infer(node.consequent, scope, c, out);
      infer(node.alternate, scope, c, out);
    }),
    NewExpression: fill(function(node, scope, c, out, name) {
      if (node.callee.type == "Identifier" && node.callee.name in scope.props)
        maybeInstantiate(scope, 20);

      for (var i = 0, args = []; i < node.arguments.length; ++i)
        args.push(infer(node.arguments[i], scope, c));
      var callee = infer(node.callee, scope, c);
      var self = new AVal;
      callee.propagate(new IsCtor(self, name && /\.prototype$/.test(name)));
      self.propagate(out, WG_NEW_INSTANCE);
      callee.propagate(new IsCallee(self, args, node.arguments, new IfObj(out)));
    }),
    CallExpression: fill(function(node, scope, c, out) {
      for (var i = 0, args = []; i < node.arguments.length; ++i)
        args.push(infer(node.arguments[i], scope, c));
      if (node.callee.type == "MemberExpression") {
        var self = infer(node.callee.object, scope, c);
        var pName = propName(node.callee, scope, c);
        if ((pName == "call" || pName == "apply") &&
            scope.fnType && scope.fnType.args.indexOf(self) > -1)
          maybeInstantiate(scope, 30);
        self.propagate(new HasMethodCall(pName, args, node.arguments, out));
      } else {
        var callee = infer(node.callee, scope, c);
        if (scope.fnType && scope.fnType.args.indexOf(callee) > -1)
          maybeInstantiate(scope, 30);
        var knownFn = callee.getFunctionType();
        if (knownFn && knownFn.instantiateScore && scope.fnType)
          maybeInstantiate(scope, knownFn.instantiateScore / 5);
        callee.propagate(new IsCallee(cx.topScope, args, node.arguments, out));
      }
    }),
    MemberExpression: fill(function(node, scope, c, out) {
      var name = propName(node, scope);
      var obj = infer(node.object, scope, c);
      var prop = obj.getProp(name);
      if (name == "<i>") {
        var propType = infer(node.property, scope, c);
        if (!propType.hasType(cx.num))
          return prop.propagate(out, WG_MULTI_MEMBER);
      }
      prop.propagate(out);
    }),
    Identifier: ret(function(node, scope) {
      if (node.name == "arguments" && scope.fnType && !(node.name in scope.props))
        scope.defProp(node.name, scope.fnType.originNode)
          .addType(new Arr(scope.fnType.arguments = new AVal));
      return scope.getProp(node.name);
    }),
    ThisExpression: ret(function(_node, scope) {
      return scope.fnType ? scope.fnType.self : cx.topScope;
    }),
    Literal: ret(function(node) {
      return literalType(node);
    })
  };

  function infer(node, scope, c, out, name) {
    return inferExprVisitor[node.type](node, scope, c, out, name);
  }

  var inferWrapper = walk.make({
    Expression: function(node, scope, c) {
      infer(node, scope, c, ANull);
    },

    FunctionDeclaration: function(node, scope, c) {
      var inner = node.body.scope, fn = inner.fnType;
      c(node.body, scope, "ScopeBody");
      maybeTagAsInstantiated(node, inner) || maybeTagAsGeneric(inner);
      var prop = scope.getProp(node.id.name);
      prop.addType(fn);
    },

    VariableDeclaration: function(node, scope, c) {
      for (var i = 0; i < node.declarations.length; ++i) {
        var decl = node.declarations[i], prop = scope.getProp(decl.id.name);
        if (decl.init)
          infer(decl.init, scope, c, prop, decl.id.name);
      }
    },

    ReturnStatement: function(node, scope, c) {
      if (!node.argument) return;
      var output = ANull;
      if (scope.fnType) {
        if (scope.fnType.retval == ANull) scope.fnType.retval = new AVal;
        output = scope.fnType.retval;
      }
      infer(node.argument, scope, c, output);
    },

    ForInStatement: function(node, scope, c) {
      var source = infer(node.right, scope, c);
      if ((node.right.type == "Identifier" && node.right.name in scope.props) ||
          (node.right.type == "MemberExpression" && node.right.property.name == "prototype")) {
        maybeInstantiate(scope, 5);
        var varName;
        if (node.left.type == "Identifier") {
          varName = node.left.name;
        } else if (node.left.type == "VariableDeclaration") {
          varName = node.left.declarations[0].id.name;
        }
        if (varName && varName in scope.props)
          scope.getProp(varName).iteratesOver = source;
      }
      c(node.body, scope, "Statement");
    },

    ScopeBody: function(node, scope, c) { c(node, node.scope || scope); }
  });

  // PARSING

  function runPasses(passes, pass) {
    var arr = passes && passes[pass];
    var args = Array.prototype.slice.call(arguments, 2);
    if (arr) for (var i = 0; i < arr.length; ++i) arr[i].apply(null, args);
  }

  var parse = exports.parse = function(text, passes, options) {
    var ast;
    try { ast = acorn.parse(text, options); }
    catch(e) { ast = acorn_loose.parse_dammit(text, options); }
    runPasses(passes, "postParse", ast, text);
    return ast;
  };

  // ANALYSIS INTERFACE

  exports.analyze = function(ast, name, scope, passes) {
    if (typeof ast == "string") ast = parse(ast);

    if (!name) name = "file#" + cx.origins.length;
    exports.addOrigin(cx.curOrigin = name);

    if (!scope) scope = cx.topScope;
    walk.recursive(ast, scope, null, scopeGatherer);
    runPasses(passes, "preInfer", ast, scope);
    walk.recursive(ast, scope, null, inferWrapper);
    runPasses(passes, "postInfer", ast, scope);

    cx.curOrigin = null;
  };

  // PURGING

  exports.purge = function(origins, start, end) {
    var test = makePredicate(origins, start, end);
    ++cx.purgeGen;
    cx.topScope.purge(test);
    for (var prop in cx.props) {
      var list = cx.props[prop];
      for (var i = 0; i < list.length; ++i) {
        var obj = list[i], av = obj.props[prop];
        if (!av || test(av, av.originNode)) list.splice(i--, 1);
      }
      if (!list.length) delete cx.props[prop];
    }
  };

  function makePredicate(origins, start, end) {
    var arr = Array.isArray(origins);
    if (arr && origins.length == 1) { origins = origins[0]; arr = false; }
    if (arr) {
      if (end == null) return function(n) { return origins.indexOf(n.origin) > -1; };
      return function(n, pos) { return pos && pos.start >= start && pos.end <= end && origins.indexOf(n.origin) > -1; };
    } else {
      if (end == null) return function(n) { return n.origin == origins; };
      return function(n, pos) { return pos && pos.start >= start && pos.end <= end && n.origin == origins; };
    }
  }

  AVal.prototype.purge = function(test) {
    if (this.purgeGen == cx.purgeGen) return;
    this.purgeGen = cx.purgeGen;
    for (var i = 0; i < this.types.length; ++i) {
      var type = this.types[i];
      if (test(type, type.originNode))
        this.types.splice(i--, 1);
      else
        type.purge(test);
    }
    if (this.forward) for (var i = 0; i < this.forward.length; ++i) {
      var f = this.forward[i];
      if (test(f)) {
        this.forward.splice(i--, 1);
        if (this.props) this.props = null;
      } else if (f.purge) {
        f.purge(test);
      }
    }
  };
  ANull.purge = function() {};
  Obj.prototype.purge = function(test) {
    if (this.purgeGen == cx.purgeGen) return true;
    this.purgeGen = cx.purgeGen;
    for (var p in this.props) {
      var av = this.props[p];
      if (test(av, av.originNode))
        this.removeProp(p);
      av.purge(test);
    }
  };
  Fn.prototype.purge = function(test) {
    if (Obj.prototype.purge.call(this, test)) return;
    this.self.purge(test);
    this.retval.purge(test);
    for (var i = 0; i < this.args.length; ++i) this.args[i].purge(test);
  };

  // EXPRESSION TYPE DETERMINATION

  function findByPropertyName(name) {
    guessing = true;
    var found = objsWithProp(name);
    if (found) for (var i = 0; i < found.length; ++i) {
      var val = found[i].getProp(name);
      if (!val.isEmpty()) return val;
    }
    return ANull;
  }

  var typeFinder = {
    ArrayExpression: function(node, scope) {
      var eltval = new AVal;
      for (var i = 0; i < node.elements.length; ++i) {
        var elt = node.elements[i];
        if (elt) findType(elt, scope).propagate(eltval);
      }
      return new Arr(eltval);
    },
    ObjectExpression: function(node) {
      return node.objType;
    },
    FunctionExpression: function(node) {
      return node.body.scope.fnType;
    },
    SequenceExpression: function(node, scope) {
      return findType(node.expressions[node.expressions.length-1], scope);
    },
    UnaryExpression: function(node) {
      return unopResultType(node.operator);
    },
    UpdateExpression: function() {
      return cx.num;
    },
    BinaryExpression: function(node, scope) {
      if (binopIsBoolean(node.operator)) return cx.bool;
      if (node.operator == "+") {
        var lhs = findType(node.left, scope);
        var rhs = findType(node.right, scope);
        if (lhs.hasType(cx.str) || rhs.hasType(cx.str)) return cx.str;
      }
      return cx.num;
    },
    AssignmentExpression: function(node, scope) {
      return findType(node.right, scope);
    },
    LogicalExpression: function(node, scope) {
      var lhs = findType(node.left, scope);
      return lhs.isEmpty() ? findType(node.right, scope) : lhs;
    },
    ConditionalExpression: function(node, scope) {
      var lhs = findType(node.consequent, scope);
      return lhs.isEmpty() ? findType(node.alternate, scope) : lhs;
    },
    NewExpression: function(node, scope) {
      var f = findType(node.callee, scope).getFunctionType();
      var proto = f && f.getProp("prototype").getObjType();
      if (!proto) return ANull;
      return getInstance(proto, f);
    },
    CallExpression: function(node, scope) {
      var f = findType(node.callee, scope).getFunctionType();
      if (!f) return ANull;
      if (f.computeRet) {
        for (var i = 0, args = []; i < node.arguments.length; ++i)
          args.push(findType(node.arguments[i], scope));
        var self = ANull;
        if (node.callee.type == "MemberExpression")
          self = findType(node.callee.object, scope);
        return f.computeRet(self, args, node.arguments);
      } else {
        return f.retval;
      }
    },
    MemberExpression: function(node, scope) {
      var propN = propName(node, scope), obj = findType(node.object, scope).getType();
      if (obj) return obj.getProp(propN);
      if (propN == "<i>") return ANull;
      return findByPropertyName(propN);
    },
    Identifier: function(node, scope) {
      return scope.hasProp(node.name) || ANull;
    },
    ThisExpression: function(_node, scope) {
      return scope.fnType ? scope.fnType.self : cx.topScope;
    },
    Literal: function(node) {
      return literalType(node);
    }
  };

  function findType(node, scope) {
    return typeFinder[node.type](node, scope);
  }

  var searchVisitor = exports.searchVisitor = walk.make({
    Function: function(node, _st, c) {
      var scope = node.body.scope;
      if (node.id) c(node.id, scope);
      for (var i = 0; i < node.params.length; ++i)
        c(node.params[i], scope);
      c(node.body, scope, "ScopeBody");
    },
    TryStatement: function(node, st, c) {
      if (node.handler)
        c(node.handler.param, st);
      walk.base.TryStatement(node, st, c);
    },
    VariableDeclaration: function(node, st, c) {
      for (var i = 0; i < node.declarations.length; ++i) {
        var decl = node.declarations[i];
        c(decl.id, st);
        if (decl.init) c(decl.init, st, "Expression");
      }
    }
  });
  exports.fullVisitor = walk.make({
    MemberExpression: function(node, st, c) {
      c(node.object, st, "Expression");
      c(node.property, st, node.computed ? "Expression" : null);
    },
    ObjectExpression: function(node, st, c) {
      for (var i = 0; i < node.properties.length; ++i) {
        c(node.properties[i].value, st, "Expression");
        c(node.properties[i].key, st);
      }
    }
  }, searchVisitor);

  exports.findExpressionAt = function(ast, start, end, defaultScope, filter) {
    var test = filter || function(_t, node) {
      if (node.type == "Identifier" && node.name == "✖") return false;
      return typeFinder.hasOwnProperty(node.type);
    };
    return walk.findNodeAt(ast, start, end, test, searchVisitor, defaultScope || cx.topScope);
  };

  exports.findExpressionAround = function(ast, start, end, defaultScope, filter) {
    var test = filter || function(_t, node) {
      if (start != null && node.start > start) return false;
      if (node.type == "Identifier" && node.name == "✖") return false;
      return typeFinder.hasOwnProperty(node.type);
    };
    return walk.findNodeAround(ast, end, test, searchVisitor, defaultScope || cx.topScope);
  };

  exports.expressionType = function(found) {
    return findType(found.node, found.state);
  };

  // Finding the expected type of something, from context

  exports.parentNode = function(child, ast) {
    var stack = [];
    function c(node, st, override) {
      if (node.start <= child.start && node.end >= child.end) {
        var top = stack[stack.length - 1];
        if (node == child) throw {found: top};
        if (top != node) stack.push(node);
        walk.base[override || node.type](node, st, c);
        if (top != node) stack.pop();
      }
    }
    try {
      c(ast, null);
    } catch (e) {
      if (e.found) return e.found;
      throw e;
    }
  };

  var findTypeFromContext = {
    ArrayExpression: function(parent, _, get) { return get(parent, true).getProp("<i>"); },
    ObjectExpression: function(parent, node, get) {
      for (var i = 0; i < parent.properties.length; ++i) {
        var prop = node.properties[i];
        if (prop.value == node)
          return get(parent, true).getProp(prop.key.name);
      }
    },
    UnaryExpression: function(parent) { return unopResultType(parent.operator); },
    UpdateExpression: function() { return cx.num; },
    BinaryExpression: function(parent) { return binopIsBoolean(parent.operator) ? cx.bool : cx.num; },
    AssignmentExpression: function(parent, _, get) { return get(parent.left); },
    LogicalExpression: function(parent, _, get) { return get(parent, true); },
    ConditionalExpression: function(parent, node, get) {
      if (parent.consequent == node || parent.alternate == node) return get(parent, true);
    },
    NewExpression: function(parent, node, get) {
      return this.CallExpression(parent, node, get);
    },
    CallExpression: function(parent, node, get) {
      for (var i = 0; i < parent.arguments.length; i++) {
        var arg = parent.arguments[i];
        if (arg == node) {
          var calleeType = get(parent.callee).getFunctionType();
          if (calleeType instanceof Fn)
            return calleeType.args[i];
          break;
        }
      }
    },
    ReturnStatement: function(_parent, node, get) {
      var fnNode = walk.findNodeAround(node.sourceFile.ast, node.start, "Function");
      if (fnNode) {
        var fnType = get(fnNode.node, true).getFunctionType();
        if (fnType) return fnType.retval.getType();
      }
    }
  };

  exports.typeFromContext = function(ast, found) {
    var parent = exports.parentNode(found.node, ast);
    var type = null;
    if (findTypeFromContext.hasOwnProperty(parent.type)) {
      type = findTypeFromContext[parent.type](parent, found.node, function(node, fromContext) {
        var obj = {node: node, state: found.state};
        var tp = fromContext ? exports.typeFromContext(ast, obj) : exports.expressionType(obj);
        return tp || ANull;
      });
    }
    return type || exports.expressionType(found);
  };

  // Flag used to indicate that some wild guessing was used to produce
  // a type or set of completions.
  var guessing = false;

  exports.resetGuessing = function(val) { guessing = val; };
  exports.didGuess = function() { return guessing; };

  exports.forAllPropertiesOf = function(type, f) {
    type.gatherProperties(f, 0);
  };

  var refFindWalker = walk.make({}, searchVisitor);

  exports.findRefs = function(ast, baseScope, name, refScope, f) {
    refFindWalker.Identifier = function(node, scope) {
      if (node.name != name) return;
      for (var s = scope; s; s = s.prev) {
        if (s == refScope) f(node, scope);
        if (name in s.props) return;
      }
    };
    walk.recursive(ast, baseScope, null, refFindWalker);
  };

  var simpleWalker = walk.make({
    Function: function(node, _st, c) { c(node.body, node.body.scope, "ScopeBody"); }
  });

  exports.findPropRefs = function(ast, scope, objType, propName, f) {
    walk.simple(ast, {
      MemberExpression: function(node, scope) {
        if (node.computed || node.property.name != propName) return;
        if (findType(node.object, scope).getType() == objType) f(node.property);
      },
      ObjectExpression: function(node, scope) {
        if (findType(node, scope).getType() != objType) return;
        for (var i = 0; i < node.properties.length; ++i)
          if (node.properties[i].key.name == propName) f(node.properties[i].key);
      }
    }, simpleWalker, scope);
  };

  // LOCAL-VARIABLE QUERIES

  var scopeAt = exports.scopeAt = function(ast, pos, defaultScope) {
    var found = walk.findNodeAround(ast, pos, function(tp, node) {
      return tp == "ScopeBody" && node.scope;
    });
    if (found) return found.node.scope;
    else return defaultScope || cx.topScope;
  };

  exports.forAllLocalsAt = function(ast, pos, defaultScope, f) {
    var scope = scopeAt(ast, pos, defaultScope);
    scope.gatherProperties(f, 0);
  };

  // INIT DEF MODULE

  // Delayed initialization because of cyclic dependencies.
  def = exports.def = def.init({}, exports);
});

//#endregion


//#region tern/lib/comment.js

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(exports);
  if (typeof define == "function" && define.amd) // AMD
    return define(["exports"], mod);
  mod(tern.comment || (tern.comment = {}));
})(function(exports) {
  function isSpace(ch) {
    return (ch < 14 && ch > 8) || ch === 32 || ch === 160;
  }

  function onOwnLine(text, pos) {
    for (; pos > 0; --pos) {
      var ch = text.charCodeAt(pos - 1);
      if (ch == 10) break;
      if (!isSpace(ch)) return false;
    }
    return true;
  }

  // Gather comments directly before a function
  exports.commentsBefore = function(text, pos) {
    var found = null, emptyLines = 0, topIsLineComment;
    out: while (pos > 0) {
      var prev = text.charCodeAt(pos - 1);
      if (prev == 10) {
        for (var scan = --pos, sawNonWS = false; scan > 0; --scan) {
          prev = text.charCodeAt(scan - 1);
          if (prev == 47 && text.charCodeAt(scan - 2) == 47) {
            if (!onOwnLine(text, scan - 2)) break out;
            var content = text.slice(scan, pos);
            if (!emptyLines && topIsLineComment) found[0] = content + "\n" + found[0];
            else (found || (found = [])).unshift(content);
            topIsLineComment = true;
            emptyLines = 0;
            pos = scan - 2;
            break;
          } else if (prev == 10) {
            if (!sawNonWS && ++emptyLines > 1) break out;
            break;
          } else if (!sawNonWS && !isSpace(prev)) {
            sawNonWS = true;
          }
        }
      } else if (prev == 47 && text.charCodeAt(pos - 2) == 42) {
        for (var scan = pos - 2; scan > 1; --scan) {
          if (text.charCodeAt(scan - 1) == 42 && text.charCodeAt(scan - 2) == 47) {
            if (!onOwnLine(text, scan - 2)) break out;
            (found || (found = [])).unshift(text.slice(scan, pos - 2));
            topIsLineComment = false;
            emptyLines = 0;
            break;
          }
        }
        pos = scan - 2;
      } else if (isSpace(prev)) {
        --pos;
      } else {
        break;
      }
    }
    return found;
  };

  exports.commentAfter = function(text, pos) {
    while (pos < text.length) {
      var next = text.charCodeAt(pos);
      if (next == 47) {
        var after = text.charCodeAt(pos + 1), end;
        if (after == 47) // line comment
          end = text.indexOf("\n", pos + 2);
        else if (after == 42) // block comment
          end = text.indexOf("*/", pos + 2);
        else
          return;
        return text.slice(pos + 2, end < 0 ? text.length : end);
      } else if (isSpace(next)) {
        ++pos;
      }
    }
  };

  exports.ensureCommentsBefore = function(text, node) {
    if (node.hasOwnProperty("commentsBefore")) return node.commentsBefore;
    return node.commentsBefore = exports.commentsBefore(text, node.start);
  };
});

//#endregion


//#region tern/plugin/requirejs.js

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern"], mod);
  mod(tern, tern);
})(function(infer, tern) {
  "use strict";

  function flattenPath(path) {
    if (!/(^|\/)(\.\/|[^\/]+\/\.\.\/)/.test(path)) return path;
    var parts = path.split("/");
    for (var i = 0; i < parts.length; ++i) {
      if (parts[i] == "." || !parts[i]) parts.splice(i--, 1);
      else if (i && parts[i] == "..") parts.splice(i-- - 1, 2);
    }
    return parts.join("/");
  }

  function resolveName(name, data) {
    var excl = name.indexOf("!");
    if (excl > -1) name = name.slice(0, excl);

    var opts = data.options;
    var hasExt = /\.js$/.test(name);
    if (hasExt || /^(?:\w+:|\/)/.test(name))
      return name + (hasExt ? "" : ".js");

    var base = opts.baseURL || "";
    if (base && base.charAt(base.length - 1) != "/") base += "/";
    if (opts.paths) {
      var known = opts.paths[name];
      if (known) return flattenPath(base + known + ".js");
      var dir = name.match(/^([^\/]+)(\/.*)$/);
      if (dir) {
        var known = opts.paths[dir[1]];
        if (known) return flattenPath(base + known + dir[2] + ".js");
      }
    }
    return flattenPath(base + name + ".js");
  }

  function getRequire(data) {
    if (!data.require) {
      data.require = new infer.Fn("require", infer.ANull, [infer.cx().str], ["module"], new infer.AVal);
      data.require.computeRet = function(_self, _args, argNodes) {
        if (argNodes.length && argNodes[0].type == "Literal" && typeof argNodes[0].value == "string")
          return getInterface(path.join(path.dirname(data.currentFile), argNodes[0].value), data);
        return infer.ANull;
      };
    }
    return data.require;
  }

  function getModuleInterface(data, exports) {
    var mod = new infer.Obj(infer.cx().definitions.requirejs.module, "module");
    var expProp = mod.defProp("exports");
    expProp.propagate(getModule(data.currentFile, data));
    exports.propagate(expProp, EXPORT_OBJ_WEIGHT);
    return mod;
  }

  function getExports(data) {
    var exports = new infer.Obj(true, "exports");
    getModule(data.currentFile, data).addType(exports, EXPORT_OBJ_WEIGHT);
    return exports;
  }

  function getInterface(name, data) {
    if (data.options.override && Object.prototype.hasOwnProperty.call(data.options.override, name)) {
      var over = data.options.override[name];
      if (typeof over == "string" && over.charAt(0) == "=") return infer.def.parsePath(over.slice(1));
      if (typeof over == "object") {
        var known = getKnownModule(name, data);
        if (known) return known;
        var scope = data.interfaces[stripJSExt(name)] = new infer.Obj(null, stripJSExt(name));
        infer.def.load(over, scope);
        return scope;
      }
      name = over;
    }

    if (!/^(https?:|\/)|\.js$/.test(name))
      name = resolveName(name, data);
    name = flattenPath(name);

    var known = getKnownModule(name, data);

    if (!known) {
      known = getModule(name, data);
      data.server.addFile(name, null, data.currentFile);
    }
    return known;
  }

  function getKnownModule(name, data) {
    return data.interfaces[stripJSExt(name)];
  }

  function getModule(name, data) {
    var known = getKnownModule(name, data);
    if (!known) {
      known = data.interfaces[stripJSExt(name)] = new infer.AVal;
      known.origin = name;
    }
    return known;
  }

  var EXPORT_OBJ_WEIGHT = 50;

  function stripJSExt(f) {
    return f.replace(/\.js$/, '');
  }

  var path = {
    dirname: function(path) {
      var lastSep = path.lastIndexOf("/");
      return lastSep == -1 ? "" : path.slice(0, lastSep);
    },
    relative: function(from, to) {
      if (to.indexOf(from) == 0) return to.slice(from.length);
      else return to;
    },
    join: function(a, b) {
      if (b && b.charAt(0) != ".") return b;
      if (a && b) return a + "/" + b;
      else return (a || "") + (b || "");
    }
  };

  infer.registerFunction("requireJS", function(_self, args, argNodes) {
    var server = infer.cx().parent, data = server && server._requireJS;
    if (!data || !args.length) return infer.ANull;

    var name = data.currentFile;
    var out = getModule(name, data);

    var deps = [], fn, exports, mod;

    function interf(name) {
      if (name == "require") return getRequire(data);
      if (name == "exports") return exports || (exports = getExports(data));
      if (name == "module") return mod || (mod = getModuleInterface(data, exports || (exports = getExports(data))));
      return getInterface(name, data);
    }

    if (argNodes && args.length > 1) {
      var node = argNodes[args.length == 2 ? 0 : 1];
      var base = path.relative(server.options.projectDir, path.dirname(node.sourceFile.name));
      if (node.type == "Literal" && typeof node.value == "string") {
        deps.push(interf(path.join(base, node.value), data));
      } else if (node.type == "ArrayExpression") for (var i = 0; i < node.elements.length; ++i) {
        var elt = node.elements[i];
        if (elt.type == "Literal" && typeof elt.value == "string")
          deps.push(interf(path.join(base, elt.value), data));
      }
    } else if (argNodes && args.length == 1 && argNodes[0].type == "FunctionExpression" && argNodes[0].params.length) {
      // Simplified CommonJS call
      deps.push(interf("require", data), interf("exports", data), interf("module", data));
      fn = args[0];
    }

    if (!fn) {
      fn = args[Math.min(args.length - 1, 2)];
      if (!fn.isEmpty() && !fn.getFunctionType()) fn = null;
    }

    if (fn) fn.propagate(new infer.IsCallee(infer.ANull, deps, null, out));
    else if (args.length) args[0].propagate(out);

    return infer.ANull;
  });

  // Parse simple ObjectExpression AST nodes to their corresponding JavaScript objects.
  function parseExprNode(node) {
    switch (node.type) {
    case "ArrayExpression":
      return node.elements.map(parseExprNode);
    case "Literal":
      return node.value;
    case "ObjectExpression":
      var obj = {};
      node.properties.forEach(function(prop) {
        var key = prop.key.name || prop.key.value;
        obj[key] = parseExprNode(prop.value);
      });
      return obj;
    }
  }

  infer.registerFunction("requireJSConfig", function(_self, _args, argNodes) {
    var server = infer.cx().parent, data = server && server._requireJS;
    if (data && argNodes && argNodes.length && argNodes[0].type == "ObjectExpression") {
      var config = parseExprNode(argNodes[0]);
      for (var key in config) if (config.hasOwnProperty(key)) {
        var value = config[key], exists = data.options[key];
        if (!exists) {
          data.options[key] = value;
        } else if (key == "paths") {
          for (var path in value) if (value.hasOwnProperty(path) && !data.options.paths[path])
            data.options.paths[path] = value[path];
        }
      }
    }
    return infer.ANull;
  });

  function preCondenseReach(state) {
    var interfaces = infer.cx().parent._requireJS.interfaces;
    var rjs = state.roots["!requirejs"] = new infer.Obj(null);
    for (var name in interfaces) {
      var prop = rjs.defProp(name.replace(/\./g, "`"));
      interfaces[name].propagate(prop);
      prop.origin = interfaces[name].origin;
    }
  }

  function postLoadDef(data) {
    var cx = infer.cx(), interfaces = cx.definitions[data["!name"]]["!requirejs"];
    var data = cx.parent._requireJS;
    if (interfaces) for (var name in interfaces.props) {
      interfaces.props[name].propagate(getInterface(name, data));
    }
  }

  tern.registerPlugin("requirejs", function(server, options) {
    server._requireJS = {
      interfaces: Object.create(null),
      options: options || {},
      currentFile: null,
      server: server
    };

    server.on("beforeLoad", function(file) {
      this._requireJS.currentFile = file.name;
    });
    server.on("reset", function() {
      this._requireJS.interfaces = Object.create(null);
      this._requireJS.require = null;
    });
    return {
      defs: defs,
      passes: {
        preCondenseReach: preCondenseReach,
        postLoadDef: postLoadDef
      }
    };
  });

  var defs = {
    "!name": "requirejs",
    "!define": {
      module: {
        id: "string",
        uri: "string",
        config: "fn() -> ?"
      },
      config: {
        "!url": "http://requirejs.org/docs/api.html#config",
        baseUrl: {
          "!type": "string",
          "!doc": "the root path to use for all module lookups",
          "!url": "http://requirejs.org/docs/api.html#config-baseUrl"
        },
        paths: {
          "!type": "?",
          "!doc": "path mappings for module names not found directly under baseUrl. The path settings are assumed to be relative to baseUrl, unless the paths setting starts with a '/' or has a URL protocol in it ('like http:').",
          "!url": "http://requirejs.org/docs/api.html#config-paths"
        },
        shim: {
          "!type": "?",
          "!doc": "Configure the dependencies, exports, and custom initialization for older, traditional 'browser globals' scripts that do not use define() to declare the dependencies and set a module value.",
          "!url": "http://requirejs.org/docs/api.html#config-shim"
        },
        map: {
          "!type": "?",
          "!doc": "For the given module prefix, instead of loading the module with the given ID, substitute a different module ID.",
          "!url": "http://requirejs.org/docs/api.html#config-map"
        },
        config: {
          "!type": "?",
          "!doc": "There is a common need to pass configuration info to a module. That configuration info is usually known as part of the application, and there needs to be a way to pass that down to a module. In RequireJS, that is done with the config option for requirejs.config(). Modules can then read that info by asking for the special dependency 'module' and calling module.config().",
          "!url": "http://requirejs.org/docs/api.html#config-moduleconfig"
        },
        packages: {
          "!type": "?",
          "!doc": "configures loading modules from CommonJS packages. See the packages topic for more information.",
          "!url": "http://requirejs.org/docs/api.html#config-packages"
        },
        nodeIdCompat: {
          "!type": "?",
          "!doc": "Node treats module ID example.js and example the same. By default these are two different IDs in RequireJS. If you end up using modules installed from npm, then you may need to set this config value to true to avoid resolution issues.",
          "!url": "http://requirejs.org/docs/api.html#config-nodeIdCompat"
        },
        waitSeconds: {
          "!type": "number",
          "!doc": "The number of seconds to wait before giving up on loading a script. Setting it to 0 disables the timeout. The default is 7 seconds.",
          "!url": "http://requirejs.org/docs/api.html#config-waitSeconds"
        },
        context: {
          "!type": "number",
          "!doc": "A name to give to a loading context. This allows require.js to load multiple versions of modules in a page, as long as each top-level require call specifies a unique context string. To use it correctly, see the Multiversion Support section.",
          "!url": "http://requirejs.org/docs/api.html#config-context"
        },
        deps: {
          "!type": "?",
          "!doc": "An array of dependencies to load. Useful when require is defined as a config object before require.js is loaded, and you want to specify dependencies to load as soon as require() is defined. Using deps is just like doing a require([]) call, but done as soon as the loader has processed the configuration. It does not block any other require() calls from starting their requests for modules, it is just a way to specify some modules to load asynchronously as part of a config block.",
          "!url": "http://requirejs.org/docs/api.html#config-deps"
        },
        callback: {
          "!type": "fn()",
          "!doc": "A function to execute after deps have been loaded. Useful when require is defined as a config object before require.js is loaded, and you want to specify a function to require after the configuration's deps array has been loaded.",
          "!url": "http://requirejs.org/docs/api.html#config-callback"
        },
        enforceDefine: {
          "!type": "bool",
          "!doc": "If set to true, an error will be thrown if a script loads that does not call define() or have a shim exports string value that can be checked. See Catching load failures in IE for more information.",
          "!url": "http://requirejs.org/docs/api.html#config-enforceDefine"
        },
        xhtml: {
          "!type": "bool",
          "!doc": "If set to true, document.createElementNS() will be used to create script elements.",
          "!url": "http://requirejs.org/docs/api.html#config-xhtml"
        },
        urlArgs: {
          "!type": "string",
          "!doc": "Extra query string arguments appended to URLs that RequireJS uses to fetch resources. Most useful to cache bust when the browser or server is not configured correctly.",
          "!url": "http://requirejs.org/docs/api.html#config-urlArgs"
        },
        scriptType: {
          "!type": "string",
          "!doc": "Specify the value for the type='' attribute used for script tags inserted into the document by RequireJS. Default is 'text/javascript'. To use Firefox's JavaScript 1.8 features, use 'text/javascript;version=1.8'.",
          "!url": "http://requirejs.org/docs/api.html#config-scriptType"
        },
        skipDataMain: {
          "!type": "bool",
          "!doc": "Introduced in RequireJS 2.1.9: If set to true, skips the data-main attribute scanning done to start module loading. Useful if RequireJS is embedded in a utility library that may interact with other RequireJS library on the page, and the embedded version should not do data-main loading.",
          "!url": "http://requirejs.org/docs/api.html#config-skipDataMain"
        }
      }
    },
    requirejs: {
      "!type": "fn(deps: [string], callback: fn(), errback: fn()) -> !custom:requireJS",
      onError: {
        "!type": "fn(err: +Error)",
        "!doc": "To detect errors that are not caught by local errbacks, you can override requirejs.onError()",
        "!url": "http://requirejs.org/docs/api.html#requirejsonerror"
      },
      load: {
        "!type": "fn(context: ?, moduleName: string, url: string)"
      },
      config: "fn(config: config) -> !custom:requireJSConfig",
      version: "string",
      isBrowser: "bool"
    },
    require: "requirejs",
    define: {
      "!type": "fn(deps: [string], callback: fn()) -> !custom:requireJS",
      amd: {
        jQuery: "bool"
      }
    }
  };
});

//#endregion


//#region tern/plugin/component.js

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"), require);
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern"], mod);
  mod(tern, tern);
})(function(infer, tern, require) {
  "use strict";

  function resolvePath(base, path) {
    var slash = base.lastIndexOf("/");
    var m;

    if (slash >= 0) path = base.slice(0, slash + 1) + path;
    while (m = /[^\/]*[^\/\.][^\/]*\/\.\.\//.exec(path))
      path = path.slice(0, m.index) + path.slice(m.index + m[0].length);

    return path.replace(/(^|[^\.])\.\//g, "$1");
  }

  function resolveModule(server, name) {
    server.addFile(name, null, server._component.currentName);
    return getModule(server._component, name);
  }

  function getModule(data, name) {
    return data.modules[name] || (data.modules[name] = new infer.AVal);
  }

  function exportsFromScope(scope) {
    var mType = scope.getProp("module").getType();
    var exportsVal = mType && mType.getProp("exports");

    if (!(exportsVal instanceof infer.AVal) || exportsVal.isEmpty())
      return scope.getProp("exports");
    else
      return exportsVal.types[exportsVal.types.length - 1];
  }

  function buildWrappingScope(parent, origin, node) {
    var scope = new infer.Scope(parent);
    var cx = infer.cx();
    scope.originNode = node;
    cx.definitions.component.require.propagate(scope.defProp("require"));

    var type = cx.definitions.component.Module.getProp("prototype").getType();
    var module = new infer.Obj(type);
    module.propagate(scope.defProp("module"));

    var exports = new infer.Obj(true, "exports", origin);
    exports.propagate(scope.defProp("exports"));
    exports.propagate(module.defProp("exports"));

    return scope;
  }

  // Assume node.js & access to local file system
  if (require) (function() {
    var fs = require("fs");
    var path = require("path");

    var win = /win/.test(process.platform);
    var resolve = path.resolve;

    if (win) resolve = function(base, file) {
      return path.resolve(base, file).replace(/\\/g, "/");
    };

    resolveModule = function(server, name, relative) {
      var data = server._component;
      var dir = server.options.projectDir || "";
      var file = name;

      if (data.options.dontLoad == true)
        return infer.ANull;

      if (data.options.dontLoad && new RegExp(data.options.dontLoad).test(name))
        return infer.ANull;

      if (data.options.load && !new RegExp(data.options.load).test(name))
        return infer.ANull;

      if (!relative) {
        try {
          var cmp = JSON.parse(fs.readFileSync(resolve(dir, "component.json")));
          if(!cmp.dependencies) return infer.ANull;
          var dpx = new RegExp("(.*?)\/" + name, 'i');
          var dep = Object.keys(cmp.dependencies).filter(function(dependency) {
            return dpx.test(dependency);
          }).pop();
          var author = dep.match(/(.*?)\/.*?/i).shift();
          author =  author.substring(0, author.length - 1);
          file = resolve(dir, "components/" + author + "-" + name);
        } catch(e) {}
      }

      try {
        var pkg = JSON.parse(fs.readFileSync(resolve(dir, file + "/component.json")));
      } catch(e) {}

      if (pkg && pkg.main) {
        file += "/" + pkg.main;
      } else {
        try {
          if (fs.statSync(resolve(dir, file)).isDirectory())
            file += "/index.js";
        } catch(e) {}
      }

      if (!/\.js$/.test(file)) file += ".js";

      try {
        if (!fs.statSync(resolve(dir, file)).isFile()) return infer.ANull;
      } catch(e) { return infer.ANull; }

      server.addFile(file, null, data.currentName);
      return data.modules[file] = data.modules[name] = new infer.AVal;
    };
  })();

  tern.registerPlugin("component", function(server, options) {
    server._component = {
      modules: Object.create(null),
      options: options || {},
      currentFile: null,
      currentName: null,
      server: server
    };

    server.on("beforeLoad", function(file) {
      this._component.currentFile = file.name.replace(/\\/g, "/");
      this._component.currentName = file.name;
      file.scope = buildWrappingScope(file.scope, file.name, file.ast);
    });

    server.on("afterLoad", function(file) {
      this._component.currentFile = this._component.currentName = null;
      exportsFromScope(file.scope).propagate(getModule(this._component, file.name));
    });

    server.on("reset", function() {
      this._component.modules = Object.create(null);
    });

    return {defs: defs};
  });

  infer.registerFunction("componentRequire", function(_self, _args, argNodes) {
    if (!argNodes || !argNodes.length || argNodes[0].type != "Literal" || typeof argNodes[0].value != "string")
      return infer.ANull;

    var cx = infer.cx();
    var server = cx.parent;
    var data = server._component;
    var name = argNodes[0].value;

    var locals = cx.definitions.component;
    if (locals[name] && /^[a-z_]*$/.test(name)) return locals[name];

    var relative = /^\.{0,2}\//.test(name);
    if (relative) {
      if (!data.currentFile) return argNodes[0].required || infer.ANull;
      name = resolvePath(data.currentFile, name);
    }

    if (name in data.modules) return data.modules[name];

    var result;
    if (data.options.modules && data.options.modules.hasOwnProperty(name)) {
      var scope = buildWrappingScope(cx.topScope, name);
      infer.def.load(data.options.modules[name], scope);
      result = data.modules[name] = exportsFromScope(scope);
    } else {
      result = resolveModule(server, name, relative);
    }

    return argNodes[0].required = result;
  });

  var defs = {
    "!name": "component",
    "!define": {
      require: {
        "!type": "fn(id: string) -> !custom:componentRequire",
        "!doc": "Require the given path/module",
        modules: {
          "!doc": "Registered modules"
        },
        aliases: {
          "!doc": "Registered aliases"
        },
        resolve: {
          "!type": "fn(path: string) -> string",
          "!doc": "Resolve path"
        },
        normalize: {
          "!type": "fn(curr: string, path: string) -> string",
          "!doc": "Normalize `path` relative to the current path"
        },
        register: {
          "!type": "fn(path: string, definition: fn())",
          "!doc": "Register module at `path` with callback `definition`"
        },
        alias: {
          "!type": "fn(from: string, to: string)",
          "!doc": "Alias a module definition"
        },
        relative: {
          "!type": "fn(parent: string) -> fn()",
          "!doc": "Return a require function relative to the `parent` path"
        }
      },
      Module: {
        "!type": "fn()",
        prototype: {
          exports: {
            "!type": "?",
            "!doc": "The exports object is created by the Module system. Sometimes this is not acceptable, many want their module to be an instance of some class. To do this assign the desired export object to module.exports. For example suppose we were making a module called a.js"
          },
          require: {
            "!type": "require",
            "!doc": "The module.require method provides a way to load a module as if require() was called from the original module."
          },
          id: {
            "!type": "string",
            "!doc": "The identifier for the module. Typically this is the fully resolved filename."
          },
          filename: {
            "!type": "string",
            "!doc": "The fully resolved filename to the module."
          },
          loaded: {
            "!type": "bool",
            "!doc": "Whether or not the module is done loading, or is in the process of loading."
          },
          parent: {
            "!type": "+Module",
            "!doc": "The module that required this one."
          },
          children: {
            "!type": "[+Module]",
            "!doc": "The module objects required by this one."
          }
        }
      }
    }
  };
});

//#endregion


//#region tern/plugin/node.js

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"), require);
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern"], mod);
  mod(tern, tern);
})(function(infer, tern, require) {
  "use strict";

  function resolvePath(base, path) {
    if (path[0] == "/") return path;
    var slash = base.lastIndexOf("/"), m;
    if (slash >= 0) path = base.slice(0, slash + 1) + path;
    while (m = /[^\/]*[^\/\.][^\/]*\/\.\.\//.exec(path))
      path = path.slice(0, m.index) + path.slice(m.index + m[0].length);
    return path.replace(/(^|[^\.])\.\//g, "$1");
  }

  function relativePath(from, to) {
    if (from[from.length - 1] != "/") from += "/";
    if (to.indexOf(from) == 0) return to.slice(from.length);
    else return to;
  }

  function getModule(data, name) {
    return data.modules[name] || (data.modules[name] = new infer.AVal);
  }

  var WG_DEFAULT_EXPORT = 95;

  function buildWrappingScope(parent, origin, node) {
    var scope = new infer.Scope(parent);
    scope.originNode = node;
    infer.cx().definitions.node.require.propagate(scope.defProp("require"));
    var module = new infer.Obj(infer.cx().definitions.node.Module.getProp("prototype").getType());
    module.propagate(scope.defProp("module"));
    var exports = new infer.Obj(true, "exports");
    module.origin = exports.origin = origin;
    module.originNode = exports.originNode = scope.originNode;
    exports.propagate(scope.defProp("exports"));
    var moduleExports = scope.exports = module.defProp("exports");
    exports.propagate(moduleExports, WG_DEFAULT_EXPORT);
    return scope;
  }

  function resolveModule(server, name, _parent) {
    server.addFile(name, null, server._node.currentOrigin);
    return getModule(server._node, name);
  }

  // Assume node.js & access to local file system
  if (require) (function() {
    var fs = require("fs"), module_ = require("module"), path = require("path");

    relativePath = path.relative;

    resolveModule = function(server, name, parent) {
      var data = server._node;
      if (data.options.dontLoad == true ||
          data.options.dontLoad && new RegExp(data.options.dontLoad).test(name) ||
          data.options.load && !new RegExp(data.options.load).test(name))
        return infer.ANull;

      if (data.modules[name]) return data.modules[name];

      var currentModule = {
        id: parent,
        paths: module_._nodeModulePaths(path.dirname(parent))
      };
      try {
        var file = module_._resolveFilename(name, currentModule);
      } catch(e) { return infer.ANull; }

      var norm = normPath(file);
      if (data.modules[norm]) return data.modules[norm];

      if (fs.existsSync(file) && /^(\.js)?$/.test(path.extname(file)))
        server.addFile(relativePath(server.options.projectDir, file), null, data.currentOrigin);
      return data.modules[norm] = new infer.AVal;
    };
  })();

  function normPath(name) { return name.replace(/\\/g, "/"); }

  function resolveProjectPath(server, pth) {
    return resolvePath(normPath(server.options.projectDir || "") + "/", normPath(pth));
  }

  infer.registerFunction("nodeRequire", function(_self, _args, argNodes) {
    if (!argNodes || !argNodes.length || argNodes[0].type != "Literal" || typeof argNodes[0].value != "string")
      return infer.ANull;
    var cx = infer.cx(), server = cx.parent, data = server._node, name = argNodes[0].value;
    var locals = cx.definitions.node;
    var result;

    if (locals[name] && /^[a-z_]*$/.test(name)) {
      result = locals[name];
    } else if (name in data.modules) {
      result = data.modules[name];
    } else if (data.options.modules && data.options.modules.hasOwnProperty(name)) {
      var scope = buildWrappingScope(cx.topScope, name);
      infer.def.load(data.options.modules[name], scope);
      result = data.modules[name] = scope.exports;
    } else {
      // data.currentFile is only available while analyzing a file; at query
      // time, determine the calling file from the caller's AST.
      var currentFile = data.currentFile || resolveProjectPath(server, argNodes[0].sourceFile.name);

      var relative = /^\.{0,2}\//.test(name);
      if (relative) {
        if (!currentFile) return argNodes[0].required || infer.ANull;
        name = resolvePath(currentFile, name);
      }
      result = resolveModule(server, name, currentFile);
    }
    return argNodes[0].required = result;
  });

  function preCondenseReach(state) {
    var mods = infer.cx().parent._node.modules;
    var node = state.roots["!node"] = new infer.Obj(null);
    for (var name in mods) {
      var mod = mods[name];
      var id = mod.origin || name;
      var prop = node.defProp(id.replace(/\./g, "`"));
      mod.propagate(prop);
      prop.origin = mod.origin;
    }
  }

  function postLoadDef(data) {
    var cx = infer.cx(), mods = cx.definitions[data["!name"]]["!node"];
    var data = cx.parent._node;
    if (mods) for (var name in mods.props) {
      var origin = name.replace(/`/g, ".");
      var mod = getModule(data, origin);
      mod.origin = origin;
      mods.props[name].propagate(mod);
    }
  }

  function findTypeAt(_file, _pos, expr, type) {
    var isStringLiteral = expr.node.type === "Literal" &&
       typeof expr.node.value === "string";
    var isRequireArg = !!expr.node.required;

    if (isStringLiteral && isRequireArg) {
      // The `type` is a value shared for all string literals.
      // We must create a copy before modifying `origin` and `originNode`.
      // Otherwise all string literals would point to the last jump location
      type = Object.create(type);

      // Provide a custom origin location pointing to the require()d file
      var exportedType;
      if (expr.node.required && (exportedType = expr.node.required.getType())) {
        type.origin = exportedType.origin;
        type.originNode = exportedType.originNode;
      }
    }

    return type;
  }

  tern.registerPlugin("node", function(server, options) {
    server._node = {
      modules: Object.create(null),
      options: options || {},
      currentFile: null,
      currentRequires: [],
      currentOrigin: null,
      server: server
    };

    server.on("beforeLoad", function(file) {
      this._node.currentFile = resolveProjectPath(server, file.name);
      this._node.currentOrigin = file.name;
      this._node.currentRequires = [];
      file.scope = buildWrappingScope(file.scope, this._node.currentOrigin, file.ast);
    });

    server.on("afterLoad", function(file) {
      var mod = getModule(this._node, this._node.currentFile);
      mod.origin = this._node.currentOrigin;
      file.scope.exports.propagate(mod);
      this._node.currentFile = null;
      this._node.currentOrigin = null;
    });

    server.on("reset", function() {
      this._node.modules = Object.create(null);
    });

    return {defs: defs,
            passes: {preCondenseReach: preCondenseReach,
                     postLoadDef: postLoadDef,
                     completion: findCompletions,
                     typeAt: findTypeAt}};
  });

  // Completes CommonJS module names in strings passed to require
  function findCompletions(file, query) {
    var wordEnd = tern.resolvePos(file, query.end);
    var callExpr = infer.findExpressionAround(file.ast, null, wordEnd, file.scope, "CallExpression");
    if (!callExpr) return;
    var callNode = callExpr.node;
    if (callNode.callee.type != "Identifier" || callNode.callee.name != "require" ||
        callNode.arguments.length < 1) return;
    var argNode = callNode.arguments[0];
    if (argNode.type != "Literal" || typeof argNode.value != "string" ||
        argNode.start > wordEnd || argNode.end < wordEnd) return;

    var word = argNode.raw.slice(1, wordEnd - argNode.start), quote = argNode.raw.charAt(0);
    if (word && word.charAt(word.length - 1) == quote)
      word = word.slice(0, word.length - 1);
    var completions = completeModuleName(query, file, word);
    if (argNode.end == wordEnd + 1 && file.text.charAt(wordEnd) == quote)
      ++wordEnd;
    return {
      start: tern.outputPos(query, file, argNode.start),
      end: tern.outputPos(query, file, wordEnd),
      isProperty: false,
      completions: completions.map(function(rec) {
        var name = typeof rec == "string" ? rec : rec.name;
        var string = JSON.stringify(name);
        if (quote == "'") string = quote + string.slice(1, string.length -1).replace(/'/g, "\\'") + quote;
        if (typeof rec == "string") return string;
        rec.displayName = name;
        rec.name = string;
        return rec;
      })
    };
  }

  function completeModuleName(query, file, word) {
    var completions = [];
    var cx = infer.cx(), server = cx.parent, data = server._node;
    var currentFile = data.currentFile || resolveProjectPath(server, file.name);
    var wrapAsObjs = query.types || query.depths || query.docs || query.urls || query.origins;

    function gather(modules) {
      for (var name in modules) {
        if (name == currentFile) continue;

        var moduleName = resolveModulePath(name, currentFile);
        if (moduleName &&
            !(query.filter !== false && word &&
              (query.caseInsensitive ? moduleName.toLowerCase() : moduleName).indexOf(word) !== 0)) {
          var rec = wrapAsObjs ? {name: moduleName} : moduleName;
          completions.push(rec);

          if (query.types || query.docs || query.urls || query.origins) {
            var val = modules[name];
            infer.resetGuessing();
            var type = val.getType();
            rec.guess = infer.didGuess();
            if (query.types)
              rec.type = infer.toString(val);
            if (query.docs)
              maybeSet(rec, "doc", val.doc || type && type.doc);
            if (query.urls)
              maybeSet(rec, "url", val.url || type && type.url);
            if (query.origins)
              maybeSet(rec, "origin", val.origin || type && type.origin);
          }
        }
      }
    }

    if (query.caseInsensitive) word = word.toLowerCase();
    gather(cx.definitions.node);
    gather(data.modules);
    return completions;
  }

  /**
   * Resolve the module path of the given module name by using the current file.
   */
  function resolveModulePath(name, currentFile) {

    function startsWith(str, prefix) {
      return str.slice(0, prefix.length) == prefix;
    }

    function endsWith(str, suffix) {
      return str.slice(-suffix.length) == suffix;
    }

    if (name.indexOf('/') == -1) return name;
    // module name has '/', compute the module path
    var modulePath = normPath(relativePath(currentFile + '/..', name));
    if (startsWith(modulePath, 'node_modules')) {
      // module name starts with node_modules, remove it
      modulePath = modulePath.substring('node_modules'.length + 1, modulePath.length);
      if (endsWith(modulePath, 'index.js')) {
        // module name ends with index.js, remove it.
       modulePath = modulePath.substring(0, modulePath.length - 'index.js'.length - 1);
      }
    } else if (!startsWith(modulePath, '../')) {
      // module name is not inside node_modules and there is not ../, add ./
      modulePath = './' + modulePath;
    }
    if (endsWith(modulePath, '.js')) {
      // remove js extension
      modulePath = modulePath.substring(0, modulePath.length - '.js'.length);
    }
    return modulePath;
  }

  function maybeSet(obj, prop, val) {
    if (val != null) obj[prop] = val;
  }

  tern.defineQueryType("node_exports", {
    takesFile: true,
    run: function(server, query, file) {
      function describe(aval) {
        var target = {}, type = aval.getType(false);
        target.type = infer.toString(aval, 3);
        var doc = aval.doc || (type && type.doc), url = aval.url || (type && type.url);
        if (doc) target.doc = doc;
        if (url) target.url = url;
        var span = tern.getSpan(aval) || (type && tern.getSpan(type));
        if (span) tern.storeSpan(server, query, span, target);
        return target;
      }

      var known = server._node.modules[resolveProjectPath(server, file.name)];
      if (!known) return {};
      var type = known.getObjType(false);
      var resp = describe(known);
      if (type instanceof infer.Obj) {
        var props = resp.props = {};
        for (var prop in type.props)
          props[prop] = describe(type.props[prop]);
      }
      return resp;
    }
  });

  var defs = {
    "!name": "node",
    "!define": {
      require: {
        "!type": "fn(id: string) -> !custom:nodeRequire",
        resolve: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/globals.html#globals_require_resolve",
          "!doc": "Use the internal require() machinery to look up the location of a module, but rather than loading the module, just return the resolved filename."
        },
        cache: {
          "!url": "http://nodejs.org/api/globals.html#globals_require_cache",
          "!doc": "Modules are cached in this object when they are required. By deleting a key value from this object, the next require will reload the module."
        },
        extensions: {
          "!url": "http://nodejs.org/api/globals.html#globals_require_extensions",
          "!doc": "Instruct require on how to handle certain file extensions."
        },
        "!url": "http://nodejs.org/api/globals.html#globals_require",
        "!doc": "To require modules."
      },
      Module: {
        "!type": "fn()",
        prototype: {
          exports: {
            "!type": "?",
            "!url": "http://nodejs.org/api/modules.html#modules_module_exports",
            "!doc": "The exports object is created by the Module system. Sometimes this is not acceptable, many want their module to be an instance of some class. To do this assign the desired export object to module.exports. For example suppose we were making a module called a.js"
          },
          require: {
            "!type": "require",
            "!url": "http://nodejs.org/api/modules.html#modules_module_require_id",
            "!doc": "The module.require method provides a way to load a module as if require() was called from the original module."
          },
          id: {
            "!type": "string",
            "!url": "http://nodejs.org/api/modules.html#modules_module_id",
            "!doc": "The identifier for the module. Typically this is the fully resolved filename."
          },
          filename: {
            "!type": "string",
            "!url": "http://nodejs.org/api/modules.html#modules_module_filename",
            "!doc": "The fully resolved filename to the module."
          },
          loaded: {
            "!type": "bool",
            "!url": "http://nodejs.org/api/modules.html#modules_module_loaded",
            "!doc": "Whether or not the module is done loading, or is in the process of loading."
          },
          parent: {
            "!type": "+Module",
            "!url": "http://nodejs.org/api/modules.html#modules_module_parent",
            "!doc": "The module that required this one."
          },
          children: {
            "!type": "[+Module]",
            "!url": "http://nodejs.org/api/modules.html#modules_module_children",
            "!doc": "The module objects required by this one."
          }
        }
      },
      events: {
        EventEmitter: {
          prototype: {
            addListener: {
              "!type": "fn(event: string, listener: fn())",
              "!url": "http://nodejs.org/api/events.html#events_emitter_addlistener_event_listener",
              "!doc": "Adds a listener to the end of the listeners array for the specified event."
            },
            on: {
              "!type": "fn(event: string, listener: fn())",
              "!url": "http://nodejs.org/api/events.html#events_emitter_on_event_listener",
              "!doc": "Adds a listener to the end of the listeners array for the specified event."
            },
            once: {
              "!type": "fn(event: string, listener: fn())",
              "!url": "http://nodejs.org/api/events.html#events_emitter_once_event_listener",
              "!doc": "Adds a one time listener for the event. This listener is invoked only the next time the event is fired, after which it is removed."
            },
            removeListener: {
              "!type": "fn(event: string, listener: fn())",
              "!url": "http://nodejs.org/api/events.html#events_emitter_removelistener_event_listener",
              "!doc": "Remove a listener from the listener array for the specified event. Caution: changes array indices in the listener array behind the listener."
            },
            removeAllListeners: {
              "!type": "fn(event: string)",
              "!url": "http://nodejs.org/api/events.html#events_emitter_removealllisteners_event",
              "!doc": "Removes all listeners, or those of the specified event."
            },
            setMaxListeners: {
              "!type": "fn(n: number)",
              "!url": "http://nodejs.org/api/events.html#events_emitter_setmaxlisteners_n",
              "!doc": "By default EventEmitters will print a warning if more than 10 listeners are added for a particular event. This is a useful default which helps finding memory leaks. Obviously not all Emitters should be limited to 10. This function allows that to be increased. Set to zero for unlimited."
            },
            listeners: {
              "!type": "fn(event: string) -> [fn()]",
              "!url": "http://nodejs.org/api/events.html#events_emitter_listeners_event",
              "!doc": "Returns an array of listeners for the specified event."
            },
            emit: {
              "!type": "fn(event: string)",
              "!url": "http://nodejs.org/api/events.html#events_emitter_emit_event_arg1_arg2",
              "!doc": "Execute each of the listeners in order with the supplied arguments."
            }
          },
          "!url": "http://nodejs.org/api/events.html#events_class_events_eventemitter",
          "!doc": "To access the EventEmitter class, require('events').EventEmitter."
        }
      },
      stream: {
        "!type": "fn()",
        prototype: {
          "!proto": "events.EventEmitter.prototype",
          pipe: {
            "!type": "fn(destination: +stream.Writable, options?: ?)",
            "!url": "http://nodejs.org/api/stream.html#stream_readable_pipe_destination_options",
            "!doc": "Connects this readable stream to destination WriteStream. Incoming data on this stream gets written to destination. Properly manages back-pressure so that a slow destination will not be overwhelmed by a fast readable stream."
          }
        },
        Writable: {
          "!type": "fn(options?: ?)",
          prototype: {
            "!proto": "stream.prototype",
            write: {
              "!type": "fn(chunk: +Buffer, encoding?: string, callback?: fn()) -> bool",
              "!url": "http://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback_1",
              "!doc": "Writes chunk to the stream. Returns true if the data has been flushed to the underlying resource. Returns false to indicate that the buffer is full, and the data will be sent out in the future. The 'drain' event will indicate when the buffer is empty again."
            },
            end: {
              "!type": "fn(chunk: +Buffer, encoding?: string, callback?: fn()) -> bool",
              "!url": "http://nodejs.org/api/stream.html#stream_writable_end_chunk_encoding_callback",
              "!doc": "Call this method to signal the end of the data being written to the stream."
            }
          },
          "!url": "http://nodejs.org/api/stream.html#stream_class_stream_writable",
          "!doc": "A Writable Stream has the following methods, members, and events."
        },
        Readable: {
          "!type": "fn(options?: ?)",
          prototype: {
            "!proto": "stream.prototype",
            setEncoding: {
              "!type": "fn(encoding: string)",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_setencoding_encoding",
              "!doc": "Makes the 'data' event emit a string instead of a Buffer. encoding can be 'utf8', 'utf16le' ('ucs2'), 'ascii', or 'hex'."
            },
            pause: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_pause",
              "!doc": "Switches the readable stream into \"old mode\", where data is emitted using a 'data' event rather than being buffered for consumption via the read() method."
            },
            resume: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_resume",
              "!doc": "Switches the readable stream into \"old mode\", where data is emitted using a 'data' event rather than being buffered for consumption via the read() method."
            },
            destroy: "fn()",
            unpipe: {
              "!type": "fn(dest?: +stream.Writable)",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_unpipe_destination",
              "!doc": "Undo a previously established pipe(). If no destination is provided, then all previously established pipes are removed."
            },
            push: {
              "!type": "fn(chunk: +Buffer) -> bool",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_push_chunk",
              "!doc": "Explicitly insert some data into the read queue. If called with null, will signal the end of the data."
            },
            unshift: {
              "!type": "fn(chunk: +Buffer) -> bool",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_unshift_chunk",
              "!doc": "This is the corollary of readable.push(chunk). Rather than putting the data at the end of the read queue, it puts it at the front of the read queue."
            },
            wrap: {
              "!type": "fn(stream: ?) -> +stream.Readable",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_wrap_stream",
              "!doc": "If you are using an older Node library that emits 'data' events and has a pause() method that is advisory only, then you can use the wrap() method to create a Readable stream that uses the old stream as its data source."
            },
            read: {
              "!type": "fn(size?: number) -> +Buffer",
              "!url": "http://nodejs.org/api/stream.html#stream_readable_read_size_1",
              "!doc": "Call this method to consume data once the 'readable' event is emitted."
            }
          },
          "!url": "http://nodejs.org/api/stream.html#stream_class_stream_readable",
          "!doc": "A Readable Stream has the following methods, members, and events."
        },
        Duplex: {
          "!type": "fn(options?: ?)",
          prototype: {
            "!proto": "stream.Readable.prototype",
            write: "fn(chunk: +Buffer, encoding?: string, callback?: fn()) -> bool",
            end: "fn(chunk: +Buffer, encoding?: string, callback?: fn()) -> bool"
          },
          "!url": "http://nodejs.org/api/stream.html#stream_class_stream_duplex",
          "!doc": "A \"duplex\" stream is one that is both Readable and Writable, such as a TCP socket connection."
        },
        Transform: {
          "!type": "fn(options?: ?)",
          prototype: {
            "!proto": "stream.Duplex.prototype"
          },
          "!url": "http://nodejs.org/api/stream.html#stream_class_stream_transform",
          "!doc": "A \"transform\" stream is a duplex stream where the output is causally connected in some way to the input, such as a zlib stream or a crypto stream."
        },
        PassThrough: "stream.Transform",
        "!url": "http://nodejs.org/api/stream.html#stream_stream",
        "!doc": "A stream is an abstract interface implemented by various objects in Node. For example a request to an HTTP server is a stream, as is stdout. Streams are readable, writable, or both. All streams are instances of EventEmitter"
      },
      querystring: {
        stringify: {
          "!type": "fn(obj: ?, sep?: string, eq?: string) -> string",
          "!url": "http://nodejs.org/api/querystring.html#querystring_querystring_stringify_obj_sep_eq",
          "!doc": "Serialize an object to a query string. Optionally override the default separator ('&') and assignment ('=') characters."
        },
        parse: {
          "!type": "fn(str: string, sep?: string, eq?: string, options?: ?) -> ?",
          "!url": "http://nodejs.org/api/querystring.html#querystring_querystring_parse_str_sep_eq_options",
          "!doc": "Deserialize a query string to an object. Optionally override the default separator ('&') and assignment ('=') characters."
        },
        escape: {
          "!type": "fn(string) -> string",
          "!url": "http://nodejs.org/api/querystring.html#querystring_querystring_escape",
          "!doc": "The escape function used by querystring.stringify, provided so that it could be overridden if necessary."
        },
        unescape: {
          "!type": "fn(string) -> string",
          "!url": "http://nodejs.org/api/querystring.html#querystring_querystring_unescape",
          "!doc": "The unescape function used by querystring.parse, provided so that it could be overridden if necessary."
        }
      },
      http: {
        STATUS_CODES: {},
        createServer: {
          "!type": "fn(listener?: fn(request: +http.IncomingMessage, response: +http.ServerResponse)) -> +http.Server",
          "!url": "http://nodejs.org/api/http.html#http_http_createserver_requestlistener",
          "!doc": "Returns a new web server object."
        },
        Server: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            listen: {
              "!type": "fn(port: number, hostname?: string, backlog?: number, callback?: fn())",
              "!url": "http://nodejs.org/api/http.html#http_server_listen_port_hostname_backlog_callback",
              "!doc": "Begin accepting connections on the specified port and hostname. If the hostname is omitted, the server will accept connections directed to any IPv4 address (INADDR_ANY)."
            },
            close: {
              "!type": "fn(callback?: ?)",
              "!url": "http://nodejs.org/api/http.html#http_server_close_callback",
              "!doc": "Stops the server from accepting new connections."
            },
            maxHeadersCount: {
              "!type": "number",
              "!url": "http://nodejs.org/api/http.html#http_server_maxheaderscount",
              "!doc": "Limits maximum incoming headers count, equal to 1000 by default. If set to 0 - no limit will be applied."
            },
            setTimeout: {
              "!type": "fn(timeout: number, callback?: fn())",
              "!url": "http://nodejs.org/api/http.html#http_server_settimeout_msecs_callback",
              "!doc": "Sets the timeout value for sockets, and emits a 'timeout' event on the Server object, passing the socket as an argument, if a timeout occurs."
            },
            timeout: {
              "!type": "number",
              "!url": "http://nodejs.org/api/http.html#http_server_timeout",
              "!doc": "The number of milliseconds of inactivity before a socket is presumed to have timed out."
            }
          },
          "!url": "http://nodejs.org/api/http.html#http_class_http_server",
          "!doc": "Class for HTTP server objects."
        },
        ServerResponse: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Writable.prototype",
            writeContinue: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/http.html#http_response_writecontinue",
              "!doc": "Sends a HTTP/1.1 100 Continue message to the client, indicating that the request body should be sent."
            },
            writeHead: {
              "!type": "fn(statusCode: number, headers?: ?)",
              "!url": "http://nodejs.org/api/http.html#http_response_writehead_statuscode_reasonphrase_headers",
              "!doc": "Sends a response header to the request. The status code is a 3-digit HTTP status code, like 404. The last argument, headers, are the response headers. Optionally one can give a human-readable reasonPhrase as the second argument."
            },
            setTimeout: {
              "!type": "fn(timeout: number, callback?: fn())",
              "!url": "http://nodejs.org/api/http.html#http_response_settimeout_msecs_callback",
              "!doc": "Sets the Socket's timeout value to msecs. If a callback is provided, then it is added as a listener on the 'timeout' event on the response object."
            },
            statusCode: {
              "!type": "number",
              "!url": "http://nodejs.org/api/http.html#http_response_statuscode",
              "!doc": "When using implicit headers (not calling response.writeHead() explicitly), this property controls the status code that will be sent to the client when the headers get flushed."
            },
            setHeader: {
              "!type": "fn(name: string, value: string)",
              "!url": "http://nodejs.org/api/http.html#http_response_setheader_name_value",
              "!doc": "Sets a single header value for implicit headers. If this header already exists in the to-be-sent headers, its value will be replaced. Use an array of strings here if you need to send multiple headers with the same name."
            },
            headersSent: {
              "!type": "bool",
              "!url": "http://nodejs.org/api/http.html#http_response_headerssent",
              "!doc": "Boolean (read-only). True if headers were sent, false otherwise."
            },
            sendDate: {
              "!type": "bool",
              "!url": "http://nodejs.org/api/http.html#http_response_senddate",
              "!doc": "When true, the Date header will be automatically generated and sent in the response if it is not already present in the headers. Defaults to true."
            },
            getHeader: {
              "!type": "fn(name: string) -> string",
              "!url": "http://nodejs.org/api/http.html#http_response_getheader_name",
              "!doc": "Reads out a header that's already been queued but not sent to the client. Note that the name is case insensitive. This can only be called before headers get implicitly flushed."
            },
            removeHeader: {
              "!type": "fn(name: string)",
              "!url": "http://nodejs.org/api/http.html#http_response_removeheader_name",
              "!doc": "Removes a header that's queued for implicit sending."
            },
            addTrailers: {
              "!type": "fn(headers: ?)",
              "!url": "http://nodejs.org/api/http.html#http_response_addtrailers_headers",
              "!doc": "This method adds HTTP trailing headers (a header but at the end of the message) to the response."
            }
          },
          "!url": "http://nodejs.org/api/http.html#http_class_http_serverresponse",
          "!doc": "This object is created internally by a HTTP server--not by the user. It is passed as the second parameter to the 'request' event."
        },
        request: {
          "!type": "fn(options: ?, callback?: fn(res: +http.IncomingMessage)) -> +http.ClientRequest",
          "!url": "http://nodejs.org/api/http.html#http_http_request_options_callback",
          "!doc": "Node maintains several connections per server to make HTTP requests. This function allows one to transparently issue requests."
        },
        get: {
          "!type": "fn(options: ?, callback?: fn(res: +http.IncomingMessage)) -> +http.ClientRequest",
          "!url": "http://nodejs.org/api/http.html#http_http_get_options_callback",
          "!doc": "Since most requests are GET requests without bodies, Node provides this convenience method. The only difference between this method and http.request() is that it sets the method to GET and calls req.end() automatically."
        },
        globalAgent: {
          "!type": "+http.Agent",
          "!url": "http://nodejs.org/api/http.html#http_http_globalagent",
          "!doc": "Global instance of Agent which is used as the default for all http client requests."
        },
        Agent: {
          "!type": "fn()",
          prototype: {
            maxSockets: {
              "!type": "number",
              "!url": "http://nodejs.org/api/http.html#http_agent_maxsockets",
              "!doc": "By default set to 5. Determines how many concurrent sockets the agent can have open per host."
            },
            sockets: {
              "!type": "[+net.Socket]",
              "!url": "http://nodejs.org/api/http.html#http_agent_sockets",
              "!doc": "An object which contains arrays of sockets currently in use by the Agent. Do not modify."
            },
            requests: {
              "!type": "[+http.ClientRequest]",
              "!url": "http://nodejs.org/api/http.html#http_agent_requests",
              "!doc": "An object which contains queues of requests that have not yet been assigned to sockets. Do not modify."
            }
          },
          "!url": "http://nodejs.org/api/http.html#http_class_http_agent",
          "!doc": "In node 0.5.3+ there is a new implementation of the HTTP Agent which is used for pooling sockets used in HTTP client requests."
        },
        ClientRequest: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Writable.prototype",
            abort: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/http.html#http_request_abort",
              "!doc": "Aborts a request. (New since v0.3.8.)"
            },
            setTimeout: {
              "!type": "fn(timeout: number, callback?: fn())",
              "!url": "http://nodejs.org/api/http.html#http_request_settimeout_timeout_callback",
              "!doc": "Once a socket is assigned to this request and is connected socket.setTimeout() will be called."
            },
            setNoDelay: {
              "!type": "fn(noDelay?: fn())",
              "!url": "http://nodejs.org/api/http.html#http_request_setnodelay_nodelay",
              "!doc": "Once a socket is assigned to this request and is connected socket.setNoDelay() will be called."
            },
            setSocketKeepAlive: {
              "!type": "fn(enable?: bool, initialDelay?: number)",
              "!url": "http://nodejs.org/api/http.html#http_request_setsocketkeepalive_enable_initialdelay",
              "!doc": "Once a socket is assigned to this request and is connected socket.setKeepAlive() will be called."
            }
          },
          "!url": "http://nodejs.org/api/http.html#http_class_http_clientrequest",
          "!doc": "This object is created internally and returned from http.request(). It represents an in-progress request whose header has already been queued. The header is still mutable using the setHeader(name, value), getHeader(name), removeHeader(name) API. The actual header will be sent along with the first data chunk or when closing the connection."
        },
        IncomingMessage: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Readable.prototype",
            httpVersion: {
              "!type": "string",
              "!url": "http://nodejs.org/api/http.html#http_message_httpversion",
              "!doc": "In case of server request, the HTTP version sent by the client. In the case of client response, the HTTP version of the connected-to server. Probably either '1.1' or '1.0'."
            },
            headers: {
              "!type": "?",
              "!url": "http://nodejs.org/api/http.html#http_message_headers",
              "!doc": "The request/response headers object."
            },
            trailers: {
              "!type": "?",
              "!url": "http://nodejs.org/api/http.html#http_message_trailers",
              "!doc": "The request/response trailers object. Only populated after the 'end' event."
            },
            setTimeout: {
              "!type": "fn(timeout: number, callback?: fn())",
              "!url": "http://nodejs.org/api/http.html#http_message_settimeout_msecs_callback",
              "!doc": "Calls message.connection.setTimeout(msecs, callback)."
            },
            setEncoding: {
              "!type": "fn(encoding?: string)",
              "!url": "http://nodejs.org/api/http.html#http_message_setencoding_encoding",
              "!doc": "Set the encoding for data emitted by the 'data' event."
            },
            pause: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/http.html#http_message_pause",
              "!doc": "Pauses request/response from emitting events. Useful to throttle back a download."
            },
            resume: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/http.html#http_message_resume",
              "!doc": "Resumes a paused request/response."
            },
            method: {
              "!type": "string",
              "!url": "http://nodejs.org/api/http.html#http_message_method",
              "!doc": "Only valid for request obtained from http.Server."
            },
            url: {
              "!type": "string",
              "!url": "http://nodejs.org/api/http.html#http_message_url",
              "!doc": "Only valid for request obtained from http.Server."
            },
            statusCode: {
              "!type": "number",
              "!url": "http://nodejs.org/api/http.html#http_message_statuscode",
              "!doc": "Only valid for response obtained from http.ClientRequest."
            },
            socket: {
              "!type": "+net.Socket",
              "!url": "http://nodejs.org/api/http.html#http_message_socket",
              "!doc": "The net.Socket object associated with the connection."
            }
          },
          "!url": "http://nodejs.org/api/http.html#http_http_incomingmessage",
          "!doc": "An IncomingMessage object is created by http.Server or http.ClientRequest and passed as the first argument to the 'request' and 'response' event respectively. It may be used to access response status, headers and data."
        }
      },
      https: {
        Server: "http.Server",
        createServer: {
          "!type": "fn(listener?: fn(request: +http.IncomingMessage, response: +http.ServerResponse)) -> +https.Server",
          "!url": "http://nodejs.org/api/https.html#https_https_createserver_options_requestlistener",
          "!doc": "Returns a new HTTPS web server object. The options is similar to tls.createServer(). The requestListener is a function which is automatically added to the 'request' event."
        },
        request: {
          "!type": "fn(options: ?, callback?: fn(res: +http.IncomingMessage)) -> +http.ClientRequest",
          "!url": "http://nodejs.org/api/https.html#https_https_request_options_callback",
          "!doc": "Makes a request to a secure web server."
        },
        get: {
          "!type": "fn(options: ?, callback?: fn(res: +http.IncomingMessage)) -> +http.ClientRequest",
          "!url": "http://nodejs.org/api/https.html#https_https_get_options_callback",
          "!doc": "Like http.get() but for HTTPS."
        },
        Agent: "http.Agent",
        globalAgent: "http.globalAgent"
      },
      cluster: {
        "!proto": "events.EventEmitter.prototype",
        settings: {
          exec: "string",
          args: "[string]",
          silent: "bool",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_settings",
          "!doc": "All settings set by the .setupMaster is stored in this settings object. This object is not supposed to be changed or set manually, by you."
        },
        Worker: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            id: {
              "!type": "string",
              "!url": "http://nodejs.org/api/cluster.html#cluster_worker_id",
              "!doc": "Each new worker is given its own unique id, this id is stored in the id."
            },
            process: {
              "!type": "+child_process.ChildProcess",
              "!url": "http://nodejs.org/api/cluster.html#cluster_worker_process",
              "!doc": "All workers are created using child_process.fork(), the returned object from this function is stored in process."
            },
            suicide: {
              "!type": "bool",
              "!url": "http://nodejs.org/api/cluster.html#cluster_worker_suicide",
              "!doc": "This property is a boolean. It is set when a worker dies after calling .kill() or immediately after calling the .disconnect() method. Until then it is undefined."
            },
            send: {
              "!type": "fn(message: ?, sendHandle?: ?)",
              "!url": "http://nodejs.org/api/cluster.html#cluster_worker_send_message_sendhandle",
              "!doc": "This function is equal to the send methods provided by child_process.fork(). In the master you should use this function to send a message to a specific worker. However in a worker you can also use process.send(message), since this is the same function."
            },
            destroy: "fn()",
            disconnect: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/cluster.html#cluster_worker_disconnect",
              "!doc": "When calling this function the worker will no longer accept new connections, but they will be handled by any other listening worker. Existing connection will be allowed to exit as usual. When no more connections exist, the IPC channel to the worker will close allowing it to die graceful. When the IPC channel is closed the disconnect event will emit, this is then followed by the exit event, there is emitted when the worker finally die."
            },
            kill: {
              "!type": "fn(signal?: string)",
              "!url": "http://nodejs.org/api/cluster.html#cluster_worker_kill_signal_sigterm",
              "!doc": "This function will kill the worker, and inform the master to not spawn a new worker. The boolean suicide lets you distinguish between voluntary and accidental exit."
            }
          },
          "!url": "http://nodejs.org/api/cluster.html#cluster_class_worker",
          "!doc": "A Worker object contains all public information and method about a worker. In the master it can be obtained using cluster.workers. In a worker it can be obtained using cluster.worker."
        },
        isMaster: {
          "!type": "bool",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_ismaster",
          "!doc": "True if the process is a master. This is determined by the process.env.NODE_UNIQUE_ID. If process.env.NODE_UNIQUE_ID is undefined, then isMaster is true."
        },
        isWorker: {
          "!type": "bool",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_isworker",
          "!doc": "This boolean flag is true if the process is a worker forked from a master. If the process.env.NODE_UNIQUE_ID is set to a value, then isWorker is true."
        },
        setupMaster: {
          "!type": "fn(settings?: cluster.settings)",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_setupmaster_settings",
          "!doc": "setupMaster is used to change the default 'fork' behavior. The new settings are effective immediately and permanently, they cannot be changed later on."
        },
        fork: {
          "!type": "fn(env?: ?) -> +cluster.Worker",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_fork_env",
          "!doc": "Spawn a new worker process. This can only be called from the master process."
        },
        disconnect: {
          "!type": "fn(callback?: fn())",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_disconnect_callback",
          "!doc": "When calling this method, all workers will commit a graceful suicide. When they are disconnected all internal handlers will be closed, allowing the master process to die graceful if no other event is waiting."
        },
        worker: {
          "!type": "+cluster.Worker",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_worker",
          "!doc": "A reference to the current worker object. Not available in the master process."
        },
        workers: {
          "!type": "[+cluster.Worker]",
          "!url": "http://nodejs.org/api/cluster.html#cluster_cluster_workers",
          "!doc": "A hash that stores the active worker objects, keyed by id field. Makes it easy to loop through all the workers. It is only available in the master process."
        },
        "!url": "http://nodejs.org/api/cluster.html#cluster_cluster",
        "!doc": "A single instance of Node runs in a single thread. To take advantage of multi-core systems the user will sometimes want to launch a cluster of Node processes to handle the load."
      },
      zlib: {
        Zlib: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Duplex.prototype",
            flush: {
              "!type": "fn(callback: fn())",
              "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_flush_callback",
              "!doc": "Flush pending data. Don't call this frivolously, premature flushes negatively impact the effectiveness of the compression algorithm."
            },
            reset: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_reset",
              "!doc": "Reset the compressor/decompressor to factory defaults. Only applicable to the inflate and deflate algorithms."
            }
          },
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_zlib",
          "!doc": "Not exported by the zlib module. It is documented here because it is the base class of the compressor/decompressor classes."
        },
        deflate: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_deflate_buf_callback",
          "!doc": "Compress a string with Deflate."
        },
        deflateRaw: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_deflateraw_buf_callback",
          "!doc": "Compress a string with DeflateRaw."
        },
        gzip: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_gzip_buf_callback",
          "!doc": "Compress a string with Gzip."
        },
        gunzip: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_gunzip_buf_callback",
          "!doc": "Decompress a raw Buffer with Gunzip."
        },
        inflate: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_inflate_buf_callback",
          "!doc": "Decompress a raw Buffer with Inflate."
        },
        inflateRaw: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_inflateraw_buf_callback",
          "!doc": "Decompress a raw Buffer with InflateRaw."
        },
        unzip: {
          "!type": "fn(buf: +Buffer, callback: fn())",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_unzip_buf_callback",
          "!doc": "Decompress a raw Buffer with Unzip."
        },
        Gzip: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_gzip",
          "!doc": "Compress data using gzip.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createGzip: {
          "!type": "fn(options: ?) -> +zlib.Zlib",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_creategzip_options",
          "!doc": "Returns a new Gzip object with an options."
        },
        Gunzip: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_gunzip",
          "!doc": "Decompress a gzip stream.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createGunzip: {
          "!type": "fn(options: ?) -> +zlib.Gunzip",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_creategunzip_options",
          "!doc": "Returns a new Gunzip object with an options."
        },
        Deflate: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_deflate",
          "!doc": "Compress data using deflate.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createDeflate: {
          "!type": "fn(options: ?) -> +zlib.Deflate",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_createdeflate_options",
          "!doc": "Returns a new Deflate object with an options."
        },
        Inflate: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_inflate",
          "!doc": "Decompress a deflate stream.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createInflate: {
          "!type": "fn(options: ?) -> +zlib.Inflate",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_createinflate_options",
          "!doc": "Returns a new Inflate object with an options."
        },
        InflateRaw: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_inflateraw",
          "!doc": "Decompress a raw deflate stream.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createInflateRaw: {
          "!type": "fn(options: ?) -> +zlib.InflateRaw",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_createinflateraw_options",
          "!doc": "Returns a new InflateRaw object with an options."
        },
        DeflateRaw: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_deflateraw",
          "!doc": "Compress data using deflate, and do not append a zlib header.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createDeflateRaw: {
          "!type": "fn(options: ?) -> +zlib.DeflateRaw",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_createdeflateraw_options",
          "!doc": "Returns a new DeflateRaw object with an options."
        },
        Unzip: {
          "!type": "fn()",
          "!url": "http://nodejs.org/api/zlib.html#zlib_class_zlib_unzip",
          "!doc": "Decompress either a Gzip- or Deflate-compressed stream by auto-detecting the header.",
          prototype: {"!proto:": "zlib.Zlib.prototype"}
        },
        createUnzip: {
          "!type": "fn(options: ?) -> +zlib.Unzip",
          "!url": "http://nodejs.org/api/zlib.html#zlib_zlib_createunzip_options",
          "!doc": "Returns a new Unzip object with an options."
        },
        Z_NO_FLUSH: "number",
        Z_PARTIAL_FLUSH: "number",
        Z_SYNC_FLUSH: "number",
        Z_FULL_FLUSH: "number",
        Z_FINISH: "number",
        Z_BLOCK: "number",
        Z_TREES: "number",
        Z_OK: "number",
        Z_STREAM_END: "number",
        Z_NEED_DICT: "number",
        Z_ERRNO: "number",
        Z_STREAM_ERROR: "number",
        Z_DATA_ERROR: "number",
        Z_MEM_ERROR: "number",
        Z_BUF_ERROR: "number",
        Z_VERSION_ERROR: "number",
        Z_NO_COMPRESSION: "number",
        Z_BEST_SPEED: "number",
        Z_BEST_COMPRESSION: "number",
        Z_DEFAULT_COMPRESSION: "number",
        Z_FILTERED: "number",
        Z_HUFFMAN_ONLY: "number",
        Z_RLE: "number",
        Z_FIXED: "number",
        Z_DEFAULT_STRATEGY: "number",
        Z_BINARY: "number",
        Z_TEXT: "number",
        Z_ASCII: "number",
        Z_UNKNOWN: "number",
        Z_DEFLATED: "number",
        Z_NULL: "number"
      },
      os: {
        tmpdir: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_tmpdir",
          "!doc": "Returns the operating system's default directory for temp files."
        },
        endianness: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_endianness",
          "!doc": "Returns the endianness of the CPU. Possible values are \"BE\" or \"LE\"."
        },
        hostname: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_hostname",
          "!doc": "Returns the hostname of the operating system."
        },
        type: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_type",
          "!doc": "Returns the operating system name."
        },
        platform: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_platform",
          "!doc": "Returns the operating system platform."
        },
        arch: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_arch",
          "!doc": "Returns the operating system CPU architecture."
        },
        release: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/os.html#os_os_release",
          "!doc": "Returns the operating system release."
        },
        uptime: {
          "!type": "fn() -> number",
          "!url": "http://nodejs.org/api/os.html#os_os_uptime",
          "!doc": "Returns the system uptime in seconds."
        },
        loadavg: {
          "!type": "fn() -> [number]",
          "!url": "http://nodejs.org/api/os.html#os_os_loadavg",
          "!doc": "Returns an array containing the 1, 5, and 15 minute load averages."
        },
        totalmem: {
          "!type": "fn() -> number",
          "!url": "http://nodejs.org/api/os.html#os_os_totalmem",
          "!doc": "Returns the total amount of system memory in bytes."
        },
        freemem: {
          "!type": "fn() -> number",
          "!url": "http://nodejs.org/api/os.html#os_os_freemem",
          "!doc": "Returns the amount of free system memory in bytes."
        },
        cpus: {
          "!type": "fn() -> [os.cpuSpec]",
          "!url": "http://nodejs.org/api/os.html#os_os_cpus",
          "!doc": "Returns an array of objects containing information about each CPU/core installed: model, speed (in MHz), and times (an object containing the number of milliseconds the CPU/core spent in: user, nice, sys, idle, and irq)."
        },
        networkInterfaces: {
          "!type": "fn() -> ?",
          "!url": "http://nodejs.org/api/os.html#os_os_networkinterfaces",
          "!doc": "Get a list of network interfaces."
        },
        EOL: {
          "!type": "string",
          "!url": "http://nodejs.org/api/os.html#os_os_eol",
          "!doc": "A constant defining the appropriate End-of-line marker for the operating system."
        }
      },
      punycode: {
        decode: {
          "!type": "fn(string: string) -> string",
          "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_decode_string",
          "!doc": "Converts a Punycode string of ASCII code points to a string of Unicode code points."
        },
        encode: {
          "!type": "fn(string: string) -> string",
          "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_encode_string",
          "!doc": "Converts a string of Unicode code points to a Punycode string of ASCII code points."
        },
        toUnicode: {
          "!type": "fn(domain: string) -> string",
          "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_tounicode_domain",
          "!doc": "Converts a Punycode string representing a domain name to Unicode. Only the Punycoded parts of the domain name will be converted, i.e. it doesn't matter if you call it on a string that has already been converted to Unicode."
        },
        toASCII: {
          "!type": "fn(domain: string) -> string",
          "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_toascii_domain",
          "!doc": "Converts a Unicode string representing a domain name to Punycode. Only the non-ASCII parts of the domain name will be converted, i.e. it doesn't matter if you call it with a domain that's already in ASCII."
        },
        ucs2: {
          decode: {
            "!type": "fn(string: string) -> string",
            "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_ucs2_decode_string",
            "!doc": "Creates an array containing the decimal code points of each Unicode character in the string. While JavaScript uses UCS-2 internally, this function will convert a pair of surrogate halves (each of which UCS-2 exposes as separate characters) into a single code point, matching UTF-16."
          },
          encode: {
            "!type": "fn(codePoints: [number]) -> string",
            "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_ucs2_encode_codepoints",
            "!doc": "Creates a string based on an array of decimal code points."
          }
        },
        version: {
          "!type": "?",
          "!url": "http://nodejs.org/api/punycode.html#punycode_punycode_version",
          "!doc": "A string representing the current Punycode.js version number."
        }
      },
      repl: {
        start: {
          "!type": "fn(options: ?) -> +events.EventEmitter",
          "!url": "http://nodejs.org/api/repl.html#repl_repl_start_options",
          "!doc": "Returns and starts a REPLServer instance."
        }
      },
      readline: {
        createInterface: {
          "!type": "fn(options: ?) -> +readline.Interface",
          "!url": "http://nodejs.org/api/readline.html#readline_readline_createinterface_options",
          "!doc": "Creates a readline Interface instance."
        },
        Interface: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            setPrompt: {
              "!type": "fn(prompt: string, length: number)",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_setprompt_prompt_length",
              "!doc": "Sets the prompt, for example when you run node on the command line, you see > , which is node's prompt."
            },
            prompt: {
              "!type": "fn(preserveCursor?: bool)",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_prompt_preservecursor",
              "!doc": "Readies readline for input from the user, putting the current setPrompt options on a new line, giving the user a new spot to write. Set preserveCursor to true to prevent the cursor placement being reset to 0."
            },
            question: {
              "!type": "fn(query: string, callback: fn())",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_question_query_callback",
              "!doc": "Prepends the prompt with query and invokes callback with the user's response. Displays the query to the user, and then invokes callback with the user's response after it has been typed."
            },
            pause: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_pause",
              "!doc": "Pauses the readline input stream, allowing it to be resumed later if needed."
            },
            resume: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_resume",
              "!doc": "Resumes the readline input stream."
            },
            close: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_close",
              "!doc": "Closes the Interface instance, relinquishing control on the input and output streams. The \"close\" event will also be emitted."
            },
            write: {
              "!type": "fn(data: ?, key?: ?)",
              "!url": "http://nodejs.org/api/readline.html#readline_rl_write_data_key",
              "!doc": "Writes data to output stream. key is an object literal to represent a key sequence; available if the terminal is a TTY."
            }
          },
          "!url": "http://nodejs.org/api/readline.html#readline_class_interface",
          "!doc": "The class that represents a readline interface with an input and output stream."
        }
      },
      vm: {
        createContext: {
          "!type": "fn(initSandbox?: ?) -> ?",
          "!url": "http://nodejs.org/api/vm.html#vm_vm_createcontext_initsandbox",
          "!doc": "vm.createContext creates a new context which is suitable for use as the 2nd argument of a subsequent call to vm.runInContext. A (V8) context comprises a global object together with a set of build-in objects and functions. The optional argument initSandbox will be shallow-copied to seed the initial contents of the global object used by the context."
        },
        Script: {
          "!type": "fn()",
          prototype: {
            runInThisContext: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/vm.html#vm_script_runinthiscontext",
              "!doc": "Similar to vm.runInThisContext but a method of a precompiled Script object. script.runInThisContext runs the code of script and returns the result. Running code does not have access to local scope, but does have access to the global object (v8: in actual context)."
            },
            runInNewContext: {
              "!type": "fn(sandbox?: ?)",
              "!url": "http://nodejs.org/api/vm.html#vm_script_runinnewcontext_sandbox",
              "!doc": "Similar to vm.runInNewContext a method of a precompiled Script object. script.runInNewContext runs the code of script with sandbox as the global object and returns the result. Running code does not have access to local scope. sandbox is optional."
            }
          },
          "!url": "http://nodejs.org/api/vm.html#vm_class_script",
          "!doc": "A class for running scripts. Returned by vm.createScript."
        },
        runInThisContext: {
          "!type": "fn(code: string, filename?: string)",
          "!url": "http://nodejs.org/api/vm.html#vm_vm_runinthiscontext_code_filename",
          "!doc": "vm.runInThisContext() compiles code, runs it and returns the result. Running code does not have access to local scope. filename is optional, it's used only in stack traces."
        },
        runInNewContext: {
          "!type": "fn(code: string, sandbox?: ?, filename?: string)",
          "!url": "http://nodejs.org/api/vm.html#vm_vm_runinnewcontext_code_sandbox_filename",
          "!doc": "vm.runInNewContext compiles code, then runs it in sandbox and returns the result. Running code does not have access to local scope. The object sandbox will be used as the global object for code. sandbox and filename are optional, filename is only used in stack traces."
        },
        runInContext: {
          "!type": "fn(code: string, context: ?, filename?: string)",
          "!url": "http://nodejs.org/api/vm.html#vm_vm_runincontext_code_context_filename",
          "!doc": "vm.runInContext compiles code, then runs it in context and returns the result. A (V8) context comprises a global object, together with a set of built-in objects and functions. Running code does not have access to local scope and the global object held within context will be used as the global object for code. filename is optional, it's used only in stack traces."
        },
        createScript: {
          "!type": "fn(code: string, filename?: string) -> +vm.Script",
          "!url": "http://nodejs.org/api/vm.html#vm_vm_createscript_code_filename",
          "!doc": "createScript compiles code but does not run it. Instead, it returns a vm.Script object representing this compiled code. This script can be run later many times using methods below. The returned script is not bound to any global object. It is bound before each run, just for that run. filename is optional, it's only used in stack traces."
        }
      },
      child_process: {
        ChildProcess: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            stdin: {
              "!type": "+stream.Writable",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_stdin",
              "!doc": "A Writable Stream that represents the child process's stdin. Closing this stream via end() often causes the child process to terminate."
            },
            stdout: {
              "!type": "+stream.Readable",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_stdout",
              "!doc": "A Readable Stream that represents the child process's stdout."
            },
            stderr: {
              "!type": "+stream.Readable",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_stderr",
              "!doc": "A Readable Stream that represents the child process's stderr."
            },
            pid: {
              "!type": "number",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_pid",
              "!doc": "The PID of the child process."
            },
            kill: {
              "!type": "fn(signal?: string)",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_kill_signal",
              "!doc": "Send a signal to the child process. If no argument is given, the process will be sent 'SIGTERM'."
            },
            send: {
              "!type": "fn(message: ?, sendHandle?: ?)",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_send_message_sendhandle",
              "!doc": "When using child_process.fork() you can write to the child using child.send(message, [sendHandle]) and messages are received by a 'message' event on the child."
            },
            disconnect: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/child_process.html#child_process_child_disconnect",
              "!doc": "To close the IPC connection between parent and child use the child.disconnect() method. This allows the child to exit gracefully since there is no IPC channel keeping it alive. When calling this method the disconnect event will be emitted in both parent and child, and the connected flag will be set to false. Please note that you can also call process.disconnect() in the child process."
            }
          },
          "!url": "http://nodejs.org/api/child_process.html#child_process_class_childprocess",
          "!doc": "ChildProcess is an EventEmitter."
        },
        spawn: {
          "!type": "fn(command: string, args?: [string], options?: ?) -> +child_process.ChildProcess",
          "!url": "http://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options",
          "!doc": "Launches a new process with the given command, with command line arguments in args. If omitted, args defaults to an empty Array."
        },
        exec: {
          "!type": "fn(command: string, callback: fn(error: ?, stdout: +Buffer, stderr: +Buffer)) -> +child_process.ChildProcess",
          "!url": "http://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback",
          "!doc": "Runs a command in a shell and buffers the output."
        },
        execFile: {
          "!type": "fn(file: string, args: [string], options: ?, callback: fn(error: ?, stdout: +Buffer, stderr: +Buffer)) -> +child_process.ChildProcess",
          "!url": "http://nodejs.org/api/child_process.html#child_process_child_process_execfile_file_args_options_callback",
          "!doc": "This is similar to child_process.exec() except it does not execute a subshell but rather the specified file directly. This makes it slightly leaner than child_process.exec. It has the same options."
        },
        fork: {
          "!type": "fn(modulePath: string, args?: [string], options?: ?) -> +child_process.ChildProcess",
          "!url": "http://nodejs.org/api/child_process.html#child_process_child_process_fork_modulepath_args_options",
          "!doc": "This is a special case of the spawn() functionality for spawning Node processes. In addition to having all the methods in a normal ChildProcess instance, the returned object has a communication channel built-in."
        }
      },
      url: {
        parse: {
          "!type": "fn(urlStr: string, parseQueryString?: bool, slashesDenoteHost?: bool) -> url.type",
          "!url": "http://nodejs.org/api/url.html#url_url_parse_urlstr_parsequerystring_slashesdenotehost",
          "!doc": "Take a URL string, and return an object."
        },
        format: {
          "!type": "fn(url: url.type) -> string",
          "!url": "http://nodejs.org/api/url.html#url_url_format_urlobj",
          "!doc": "Take a parsed URL object, and return a formatted URL string."
        },
        resolve: {
          "!type": "fn(from: string, to: string) -> string",
          "!url": "http://nodejs.org/api/url.html#url_url_resolve_from_to",
          "!doc": "Take a base URL, and a href URL, and resolve them as a browser would for an anchor tag."
        }
      },
      dns: {
        lookup: {
          "!type": "fn(domain: string, callback: fn(err: +Error, address: string, family: number)) -> string",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_lookup_domain_family_callback",
          "!doc": "Resolves a domain (e.g. 'google.com') into the first found A (IPv4) or AAAA (IPv6) record. The family can be the integer 4 or 6. Defaults to null that indicates both Ip v4 and v6 address family."
        },
        resolve: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolve_domain_rrtype_callback",
          "!doc": "Resolves a domain (e.g. 'google.com') into an array of the record types specified by rrtype. Valid rrtypes are 'A' (IPV4 addresses, default), 'AAAA' (IPV6 addresses), 'MX' (mail exchange records), 'TXT' (text records), 'SRV' (SRV records), 'PTR' (used for reverse IP lookups), 'NS' (name server records) and 'CNAME' (canonical name records)."
        },
        resolve4: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolve4_domain_callback",
          "!doc": "The same as dns.resolve(), but only for IPv4 queries (A records). addresses is an array of IPv4 addresses (e.g. ['74.125.79.104', '74.125.79.105', '74.125.79.106'])."
        },
        resolve6: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolve6_domain_callback",
          "!doc": "The same as dns.resolve4() except for IPv6 queries (an AAAA query)."
        },
        resolveMx: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolvemx_domain_callback",
          "!doc": "The same as dns.resolve(), but only for mail exchange queries (MX records)."
        },
        resolveTxt: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolvetxt_domain_callback",
          "!doc": "The same as dns.resolve(), but only for text queries (TXT records). addresses is an array of the text records available for domain (e.g., ['v=spf1 ip4:0.0.0.0 ~all'])."
        },
        resolveSrv: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolvesrv_domain_callback",
          "!doc": "The same as dns.resolve(), but only for service records (SRV records). addresses is an array of the SRV records available for domain. Properties of SRV records are priority, weight, port, and name (e.g., [{'priority': 10, {'weight': 5, 'port': 21223, 'name': 'service.example.com'}, ...])."
        },
        resolveNs: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolvens_domain_callback",
          "!doc": "The same as dns.resolve(), but only for name server records (NS records). addresses is an array of the name server records available for domain (e.g., ['ns1.example.com', 'ns2.example.com'])."
        },
        resolveCname: {
          "!type": "fn(domain: string, callback: fn(err: +Error, addresses: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_resolvecname_domain_callback",
          "!doc": "The same as dns.resolve(), but only for canonical name records (CNAME records). addresses is an array of the canonical name records available for domain (e.g., ['bar.example.com'])."
        },
        reverse: {
          "!type": "fn(ip: string, callback: fn(err: +Error, domains: [string])) -> [string]",
          "!url": "http://nodejs.org/api/dns.html#dns_dns_reverse_ip_callback",
          "!doc": "Reverse resolves an ip address to an array of domain names."
        }
      },
      net: {
        createServer: {
          "!type": "fn(options?: ?, connectionListener?: fn(socket: +net.Socket)) -> +net.Server",
          "!url": "http://nodejs.org/api/net.html#net_net_createserver_options_connectionlistener",
          "!doc": "Creates a new TCP server. The connectionListener argument is automatically set as a listener for the 'connection' event."
        },
        Server: {
          "!type": "fn()",
          prototype: {
            "!proto": "net.Socket.prototype",
            listen: {
              "!type": "fn(port: number, hostname?: string, backlog?: number, callback?: fn())",
              "!url": "http://nodejs.org/api/net.html#net_server_listen_port_host_backlog_callback",
              "!doc": "Begin accepting connections on the specified port and host. If the host is omitted, the server will accept connections directed to any IPv4 address (INADDR_ANY). A port value of zero will assign a random port."
            },
            close: {
              "!type": "fn(callback?: fn())",
              "!url": "http://nodejs.org/api/net.html#net_server_close_callback",
              "!doc": "Stops the server from accepting new connections and keeps existing connections. This function is asynchronous, the server is finally closed when all connections are ended and the server emits a 'close' event. Optionally, you can pass a callback to listen for the 'close' event."
            },
            maxConnections: {
              "!type": "number",
              "!url": "http://nodejs.org/api/net.html#net_server_maxconnections",
              "!doc": "Set this property to reject connections when the server's connection count gets high."
            },
            getConnections: {
              "!type": "fn(callback: fn(err: +Error, count: number))",
              "!url": "http://nodejs.org/api/net.html#net_server_getconnections_callback",
              "!doc": "Asynchronously get the number of concurrent connections on the server. Works when sockets were sent to forks."
            }
          },
          "!url": "http://nodejs.org/api/net.html#net_class_net_server",
          "!doc": "This class is used to create a TCP or UNIX server. A server is a net.Socket that can listen for new incoming connections."
        },
        Socket: {
          "!type": "fn(options: ?)",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            connect: {
              "!type": "fn(port: number, host?: string, connectionListener?: fn())",
              "!url": "http://nodejs.org/api/net.html#net_socket_connect_port_host_connectlistener",
              "!doc": "Opens the connection for a given socket. If port and host are given, then the socket will be opened as a TCP socket, if host is omitted, localhost will be assumed. If a path is given, the socket will be opened as a unix socket to that path."
            },
            bufferSize: {
              "!type": "number",
              "!url": "http://nodejs.org/api/net.html#net_socket_buffersize",
              "!doc": "net.Socket has the property that socket.write() always works. This is to help users get up and running quickly. The computer cannot always keep up with the amount of data that is written to a socket - the network connection simply might be too slow. Node will internally queue up the data written to a socket and send it out over the wire when it is possible. (Internally it is polling on the socket's file descriptor for being writable)."
            },
            setEncoding: {
              "!type": "fn(encoding?: string)",
              "!url": "http://nodejs.org/api/net.html#net_socket_setencoding_encoding",
              "!doc": "Set the encoding for the socket as a Readable Stream."
            },
            write: {
              "!type": "fn(data: +Buffer, encoding?: string, callback?: fn())",
              "!url": "http://nodejs.org/api/net.html#net_socket_write_data_encoding_callback",
              "!doc": "Sends data on the socket. The second parameter specifies the encoding in the case of a string--it defaults to UTF8 encoding."
            },
            end: {
              "!type": "fn(data?: +Buffer, encoding?: string)",
              "!url": "http://nodejs.org/api/net.html#net_socket_end_data_encoding",
              "!doc": "Half-closes the socket. i.e., it sends a FIN packet. It is possible the server will still send some data."
            },
            destroy: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/net.html#net_socket_destroy",
              "!doc": "Ensures that no more I/O activity happens on this socket. Only necessary in case of errors (parse error or so)."
            },
            pause: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/net.html#net_socket_pause",
              "!doc": "Pauses the reading of data. That is, 'data' events will not be emitted. Useful to throttle back an upload."
            },
            resume: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/net.html#net_socket_resume",
              "!doc": "Resumes reading after a call to pause()."
            },
            setTimeout: {
              "!type": "fn(timeout: number, callback?: fn())",
              "!url": "http://nodejs.org/api/net.html#net_socket_settimeout_timeout_callback",
              "!doc": "Sets the socket to timeout after timeout milliseconds of inactivity on the socket. By default net.Socket do not have a timeout."
            },
            setKeepAlive: {
              "!type": "fn(enable?: bool, initialDelay?: number)",
              "!url": "http://nodejs.org/api/net.html#net_socket_setkeepalive_enable_initialdelay",
              "!doc": "Enable/disable keep-alive functionality, and optionally set the initial delay before the first keepalive probe is sent on an idle socket. enable defaults to false."
            },
            address: {
              "!type": "fn() -> net.address",
              "!url": "http://nodejs.org/api/net.html#net_socket_address",
              "!doc": "Returns the bound address, the address family name and port of the socket as reported by the operating system. Returns an object with three properties, e.g. { port: 12346, family: 'IPv4', address: '127.0.0.1' }"
            },
            unref: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/net.html#net_socket_unref",
              "!doc": "Calling unref on a socket will allow the program to exit if this is the only active socket in the event system. If the socket is already unrefd calling unref again will have no effect."
            },
            ref: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/net.html#net_socket_ref",
              "!doc": "Opposite of unref, calling ref on a previously unrefd socket will not let the program exit if it's the only socket left (the default behavior). If the socket is refd calling ref again will have no effect."
            },
            remoteAddress: {
              "!type": "string",
              "!url": "http://nodejs.org/api/net.html#net_socket_remoteaddress",
              "!doc": "The string representation of the remote IP address. For example, '74.125.127.100' or '2001:4860:a005::68'."
            },
            remotePort: {
              "!type": "number",
              "!url": "http://nodejs.org/api/net.html#net_socket_remoteport",
              "!doc": "The numeric representation of the remote port. For example, 80 or 21."
            },
            localPort: {
              "!type": "number",
              "!url": "http://nodejs.org/api/net.html#net_socket_localport",
              "!doc": "The numeric representation of the local port. For example, 80 or 21."
            },
            bytesRead: {
              "!type": "number",
              "!url": "http://nodejs.org/api/net.html#net_socket_bytesread",
              "!doc": "The amount of received bytes."
            },
            bytesWritten: {
              "!type": "number",
              "!url": "http://nodejs.org/api/net.html#net_socket_byteswritten",
              "!doc": "The amount of bytes sent."
            },
            setNoDelay: {
              "!type": "fn(noDelay?: fn())",
              "!url": "http://nodejs.org/api/net.html#net_socket_setnodelay_nodelay",
              "!doc": "Disables the Nagle algorithm. By default TCP connections use the Nagle algorithm, they buffer data before sending it off. Setting true for noDelay will immediately fire off data each time socket.write() is called. noDelay defaults to true."
            },
            localAddress: {
              "!type": "string",
              "!url": "http://nodejs.org/api/net.html#net_socket_localaddress",
              "!doc": "The string representation of the local IP address the remote client is connecting on. For example, if you are listening on '0.0.0.0' and the client connects on '192.168.1.1', the value would be '192.168.1.1'."
            }
          },
          "!url": "http://nodejs.org/api/net.html#net_class_net_socket",
          "!doc": "This object is an abstraction of a TCP or UNIX socket. net.Socket instances implement a duplex Stream interface. They can be created by the user and used as a client (with connect()) or they can be created by Node and passed to the user through the 'connection' event of a server."
        },
        connect: {
          "!type": "fn(options: ?, connectionListener?: fn()) -> +net.Socket",
          "!url": "http://nodejs.org/api/net.html#net_net_connect_options_connectionlistener",
          "!doc": "Constructs a new socket object and opens the socket to the given location. When the socket is established, the 'connect' event will be emitted."
        },
        createConnection: {
          "!type": "fn(options: ?, connectionListener?: fn()) -> +net.Socket",
          "!url": "http://nodejs.org/api/net.html#net_net_createconnection_options_connectionlistener",
          "!doc": "Constructs a new socket object and opens the socket to the given location. When the socket is established, the 'connect' event will be emitted."
        },
        isIP: {
          "!type": "fn(input: string) -> number",
          "!url": "http://nodejs.org/api/net.html#net_net_isip_input",
          "!doc": "Tests if input is an IP address. Returns 0 for invalid strings, returns 4 for IP version 4 addresses, and returns 6 for IP version 6 addresses."
        },
        isIPv4: {
          "!type": "fn(input: string) -> bool",
          "!url": "http://nodejs.org/api/net.html#net_net_isipv4_input",
          "!doc": "Returns true if input is a version 4 IP address, otherwise returns false."
        },
        isIPv6: {
          "!type": "fn(input: string) -> bool",
          "!url": "http://nodejs.org/api/net.html#net_net_isipv6_input",
          "!doc": "Returns true if input is a version 6 IP address, otherwise returns false."
        }
      },
      dgram: {
        createSocket: {
          "!type": "fn(type: string, callback?: fn()) -> +dgram.Socket",
          "!url": "http://nodejs.org/api/dgram.html#dgram_dgram_createsocket_type_callback",
          "!doc": "Creates a datagram Socket of the specified types. Valid types are udp4 and udp6."
        },
        Socket: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            send: {
              "!type": "fn(buf: +Buffer, offset: number, length: number, port: number, address: string, callback?: fn())",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_send_buf_offset_length_port_address_callback",
              "!doc": "For UDP sockets, the destination port and IP address must be specified. A string may be supplied for the address parameter, and it will be resolved with DNS. An optional callback may be specified to detect any DNS errors and when buf may be re-used. Note that DNS lookups will delay the time that a send takes place, at least until the next tick. The only way to know for sure that a send has taken place is to use the callback."
            },
            bind: {
              "!type": "fn(port: number, address?: string)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_bind_port_address_callback",
              "!doc": "For UDP sockets, listen for datagrams on a named port and optional address. If address is not specified, the OS will try to listen on all addresses."
            },
            close: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_close",
              "!doc": "Close the underlying socket and stop listening for data on it."
            },
            address: {
              address: "string",
              family: "string",
              port: "number",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_address",
              "!doc": "Returns an object containing the address information for a socket. For UDP sockets, this object will contain address , family and port."
            },
            setBroadcast: {
              "!type": "fn(flag: bool)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_setbroadcast_flag",
              "!doc": "Sets or clears the SO_BROADCAST socket option. When this option is set, UDP packets may be sent to a local interface's broadcast address."
            },
            setTTL: {
              "!type": "fn(ttl: number)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_setttl_ttl",
              "!doc": "Sets the IP_TTL socket option. TTL stands for \"Time to Live,\" but in this context it specifies the number of IP hops that a packet is allowed to go through. Each router or gateway that forwards a packet decrements the TTL. If the TTL is decremented to 0 by a router, it will not be forwarded. Changing TTL values is typically done for network probes or when multicasting."
            },
            setMulticastTTL: {
              "!type": "fn(ttl: number)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_setmulticastttl_ttl",
              "!doc": "Sets the IP_MULTICAST_TTL socket option. TTL stands for \"Time to Live,\" but in this context it specifies the number of IP hops that a packet is allowed to go through, specifically for multicast traffic. Each router or gateway that forwards a packet decrements the TTL. If the TTL is decremented to 0 by a router, it will not be forwarded."
            },
            setMulticastLoopback: {
              "!type": "fn(flag: bool)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_setmulticastloopback_flag",
              "!doc": "Sets or clears the IP_MULTICAST_LOOP socket option. When this option is set, multicast packets will also be received on the local interface."
            },
            addMembership: {
              "!type": "fn(multicastAddress: string, multicastInterface?: string)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_addmembership_multicastaddress_multicastinterface",
              "!doc": "Tells the kernel to join a multicast group with IP_ADD_MEMBERSHIP socket option."
            },
            dropMembership: {
              "!type": "fn(multicastAddress: string, multicastInterface?: string)",
              "!url": "http://nodejs.org/api/dgram.html#dgram_socket_dropmembership_multicastaddress_multicastinterface",
              "!doc": "Opposite of addMembership - tells the kernel to leave a multicast group with IP_DROP_MEMBERSHIP socket option. This is automatically called by the kernel when the socket is closed or process terminates, so most apps will never need to call this."
            }
          },
          "!url": "http://nodejs.org/api/dgram.html#dgram_class_dgram_socket",
          "!doc": "The dgram Socket class encapsulates the datagram functionality. It should be created via dgram.createSocket(type, [callback])."
        }
      },
      fs: {
        rename: {
          "!type": "fn(oldPath: string, newPath: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_rename_oldpath_newpath_callback",
          "!doc": "Asynchronous rename(2). No arguments other than a possible exception are given to the completion callback."
        },
        renameSync: {
          "!type": "fn(oldPath: string, newPath: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_renamesync_oldpath_newpath",
          "!doc": "Synchronous rename(2)."
        },
        ftruncate: {
          "!type": "fn(fd: number, len: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_ftruncate_fd_len_callback",
          "!doc": "Asynchronous ftruncate(2). No arguments other than a possible exception are given to the completion callback."
        },
        ftruncateSync: {
          "!type": "fn(fd: number, len: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_ftruncatesync_fd_len",
          "!doc": "Synchronous ftruncate(2)."
        },
        truncate: {
          "!type": "fn(path: string, len: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_truncate_path_len_callback",
          "!doc": "Asynchronous truncate(2). No arguments other than a possible exception are given to the completion callback."
        },
        truncateSync: {
          "!type": "fn(path: string, len: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_truncatesync_path_len",
          "!doc": "Synchronous truncate(2)."
        },
        chown: {
          "!type": "fn(path: string, uid: number, gid: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_chown_path_uid_gid_callback",
          "!doc": "Asynchronous chown(2). No arguments other than a possible exception are given to the completion callback."
        },
        chownSync: {
          "!type": "fn(path: string, uid: number, gid: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_chownsync_path_uid_gid",
          "!doc": "Synchronous chown(2)."
        },
        fchown: {
          "!type": "fn(fd: number, uid: number, gid: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fchown_fd_uid_gid_callback",
          "!doc": "Asynchronous fchown(2). No arguments other than a possible exception are given to the completion callback."
        },
        fchownSync: {
          "!type": "fn(fd: number, uid: number, gid: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fchownsync_fd_uid_gid",
          "!doc": "Synchronous fchown(2)."
        },
        lchown: {
          "!type": "fn(path: string, uid: number, gid: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_lchown_path_uid_gid_callback",
          "!doc": "Asynchronous lchown(2). No arguments other than a possible exception are given to the completion callback."
        },
        lchownSync: {
          "!type": "fn(path: string, uid: number, gid: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_lchownsync_path_uid_gid",
          "!doc": "Synchronous lchown(2)."
        },
        chmod: {
          "!type": "fn(path: string, mode: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_chmod_path_mode_callback",
          "!doc": "Asynchronous chmod(2). No arguments other than a possible exception are given to the completion callback."
        },
        chmodSync: {
          "!type": "fn(path: string, mode: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_chmodsync_path_mode",
          "!doc": "Synchronous chmod(2)."
        },
        fchmod: {
          "!type": "fn(fd: number, mode: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fchmod_fd_mode_callback",
          "!doc": "Asynchronous fchmod(2). No arguments other than a possible exception are given to the completion callback."
        },
        fchmodSync: {
          "!type": "fn(fd: number, mode: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fchmodsync_fd_mode",
          "!doc": "Synchronous fchmod(2)."
        },
        lchmod: {
          "!type": "fn(path: string, mode: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_lchmod_path_mode_callback",
          "!doc": "Asynchronous lchmod(2). No arguments other than a possible exception are given to the completion callback."
        },
        lchmodSync: {
          "!type": "fn(path: string, mode: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_lchmodsync_path_mode",
          "!doc": "Synchronous lchmod(2)."
        },
        stat: {
          "!type": "fn(path: string, callback?: fn(err: +Error, stats: +fs.Stats) -> ?) -> +fs.Stats",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_stat_path_callback",
          "!doc": "Asynchronous stat(2). The callback gets two arguments (err, stats) where stats is a fs.Stats object."
        },
        lstat: {
          "!type": "fn(path: string, callback?: fn(err: +Error, stats: +fs.Stats) -> ?) -> +fs.Stats",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_lstat_path_callback",
          "!doc": "Asynchronous lstat(2). The callback gets two arguments (err, stats) where stats is a fs.Stats object. lstat() is identical to stat(), except that if path is a symbolic link, then the link itself is stat-ed, not the file that it refers to."
        },
        fstat: {
          "!type": "fn(fd: number, callback?: fn(err: +Error, stats: +fs.Stats) -> ?) -> +fs.Stats",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fstat_fd_callback",
          "!doc": "Asynchronous fstat(2). The callback gets two arguments (err, stats) where stats is a fs.Stats object. fstat() is identical to stat(), except that the file to be stat-ed is specified by the file descriptor fd."
        },
        statSync: {
          "!type": "fn(path: string) -> +fs.Stats",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_statsync_path",
          "!doc": "Synchronous stat(2). Returns an instance of fs.Stats."
        },
        lstatSync: {
          "!type": "fn(path: string) -> +fs.Stats",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_lstatsync_path",
          "!doc": "Synchronous lstat(2). Returns an instance of fs.Stats."
        },
        fstatSync: {
          "!type": "fn(fd: number) -> +fs.Stats",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fstatsync_fd",
          "!doc": "Synchronous fstat(2). Returns an instance of fs.Stats."
        },
        link: {
          "!type": "fn(srcpath: string, dstpath: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_link_srcpath_dstpath_callback",
          "!doc": "Asynchronous link(2). No arguments other than a possible exception are given to the completion callback."
        },
        linkSync: {
          "!type": "fn(srcpath: string, dstpath: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_linksync_srcpath_dstpath",
          "!doc": "Synchronous link(2)."
        },
        symlink: {
          "!type": "fn(srcpath: string, dstpath: string, type?: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback",
          "!doc": "Asynchronous symlink(2). No arguments other than a possible exception are given to the completion callback. type argument can be either 'dir', 'file', or 'junction' (default is 'file'). It is only used on Windows (ignored on other platforms). Note that Windows junction points require the destination path to be absolute. When using 'junction', the destination argument will automatically be normalized to absolute path."
        },
        symlinkSync: {
          "!type": "fn(srcpath: string, dstpath: string, type?: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_symlinksync_srcpath_dstpath_type",
          "!doc": "Synchronous symlink(2)."
        },
        readlink: {
          "!type": "fn(path: string, callback?: fn(err: +Error, linkString: string))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readlink_path_callback",
          "!doc": "Asynchronous readlink(2). The callback gets two arguments (err, linkString)."
        },
        readlinkSync: {
          "!type": "fn(path: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readlinksync_path",
          "!doc": "Synchronous readlink(2). Returns the symbolic link's string value."
        },
        realpath: {
          "!type": "fn(path: string, cache: string, callback: fn(err: +Error, resolvedPath: string))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_realpath_path_cache_callback",
          "!doc": "Asynchronous realpath(2). The callback gets two arguments (err, resolvedPath). May use process.cwd to resolve relative paths. cache is an object literal of mapped paths that can be used to force a specific path resolution or avoid additional fs.stat calls for known real paths."
        },
        realpathSync: {
          "!type": "fn(path: string, cache?: bool) -> string",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_realpathsync_path_cache",
          "!doc": "Synchronous realpath(2). Returns the resolved path."
        },
        unlink: {
          "!type": "fn(path: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_unlink_path_callback",
          "!doc": "Asynchronous unlink(2). No arguments other than a possible exception are given to the completion callback."
        },
        unlinkSync: {
          "!type": "fn(path: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_unlinksync_path",
          "!doc": "Synchronous unlink(2)."
        },
        rmdir: {
          "!type": "fn(path: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_rmdir_path_callback",
          "!doc": "Asynchronous rmdir(2). No arguments other than a possible exception are given to the completion callback."
        },
        rmdirSync: {
          "!type": "fn(path: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_rmdirsync_path",
          "!doc": "Synchronous rmdir(2)."
        },
        mkdir: {
          "!type": "fn(path: string, mode?: ?, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_mkdir_path_mode_callback",
          "!doc": "Asynchronous mkdir(2). No arguments other than a possible exception are given to the completion callback. mode defaults to 0777."
        },
        mkdirSync: {
          "!type": "fn(path: string, mode?: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_mkdirsync_path_mode",
          "!doc": "Synchronous mkdir(2)."
        },
        readdir: {
          "!type": "fn(path: string, callback?: fn(err: +Error, files: [string]))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readdir_path_callback",
          "!doc": "Asynchronous readdir(3). Reads the contents of a directory. The callback gets two arguments (err, files) where files is an array of the names of the files in the directory excluding '.' and '..'."
        },
        readdirSync: {
          "!type": "fn(path: string) -> [string]",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readdirsync_path",
          "!doc": "Synchronous readdir(3). Returns an array of filenames excluding '.' and '..'."
        },
        close: {
          "!type": "fn(fd: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_close_fd_callback",
          "!doc": "Asynchronous close(2). No arguments other than a possible exception are given to the completion callback."
        },
        closeSync: {
          "!type": "fn(fd: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_closesync_fd",
          "!doc": "Synchronous close(2)."
        },
        open: {
          "!type": "fn(path: string, flags: string, mode?: string, callback?: fn(err: +Error, fd: number))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_open_path_flags_mode_callback",
          "!doc": "Asynchronous file open."
        },
        openSync: {
          "!type": "fn(path: string, flags: string, mode?: string) -> number",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_opensync_path_flags_mode",
          "!doc": "Synchronous open(2)."
        },
        utimes: {
          "!type": "fn(path: string, atime: number, mtime: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_utimes_path_atime_mtime_callback",
          "!doc": "Change file timestamps of the file referenced by the supplied path."
        },
        utimesSync: {
          "!type": "fn(path: string, atime: number, mtime: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_utimessync_path_atime_mtime",
          "!doc": "Change file timestamps of the file referenced by the supplied path."
        },
        futimes: {
          "!type": "fn(fd: number, atime: number, mtime: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_futimes_fd_atime_mtime_callback",
          "!doc": "Change the file timestamps of a file referenced by the supplied file descriptor."
        },
        futimesSync: {
          "!type": "fn(fd: number, atime: number, mtime: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_futimessync_fd_atime_mtime",
          "!doc": "Change the file timestamps of a file referenced by the supplied file descriptor."
        },
        fsync: {
          "!type": "fn(fd: number, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fsync_fd_callback",
          "!doc": "Asynchronous fsync(2). No arguments other than a possible exception are given to the completion callback."
        },
        fsyncSync: {
          "!type": "fn(fd: number)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_fsyncsync_fd",
          "!doc": "Synchronous fsync(2)."
        },
        write: {
          "!type": "fn(fd: number, buffer: +Buffer, offset: number, length: number, position: number, callback?: fn(err: +Error, written: number, buffer: +Buffer))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_write_fd_buffer_offset_length_position_callback",
          "!doc": "Write buffer to the file specified by fd."
        },
        writeSync: {
          "!type": "fn(fd: number, buffer: +Buffer, offset: number, length: number, position: number) -> number",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_writesync_fd_buffer_offset_length_position",
          "!doc": "Synchronous version of fs.write(). Returns the number of bytes written."
        },
        read: {
          "!type": "fn(fd: number, buffer: +Buffer, offset: number, length: number, position: number, callback?: fn(err: +Error, bytesRead: number, buffer: +Buffer))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_read_fd_buffer_offset_length_position_callback",
          "!doc": "Read data from the file specified by fd."
        },
        readSync: {
          "!type": "fn(fd: number, buffer: +Buffer, offset: number, length: number, position: number) -> number",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readsync_fd_buffer_offset_length_position",
          "!doc": "Synchronous version of fs.read. Returns the number of bytesRead."
        },
        readFile: {
          "!type": "fn(filename: string, callback: fn(err: +Error, data: +Buffer))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readfile_filename_options_callback",
          "!doc": "Asynchronously reads the entire contents of a file."
        },
        readFileSync: {
          "!type": "fn(filename: string, encoding: string) -> +Buffer",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_readfilesync_filename_options",
          "!doc": "Synchronous version of fs.readFile. Returns the contents of the filename."
        },
        writeFile: {
          "!type": "fn(filename: string, data: +Buffer, encoding?: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_writefile_filename_data_options_callback",
          "!doc": "Asynchronously writes data to a file, replacing the file if it already exists. data can be a string or a buffer."
        },
        writeFileSync: {
          "!type": "fn(filename: string, data: +Buffer, encoding?: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_writefilesync_filename_data_options",
          "!doc": "The synchronous version of fs.writeFile."
        },
        appendFile: {
          "!type": "fn(filename: string, data: ?, encoding?: string, callback?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_appendfile_filename_data_options_callback",
          "!doc": "Asynchronously append data to a file, creating the file if it not yet exists. data can be a string or a buffer."
        },
        appendFileSync: {
          "!type": "fn(filename: string, data: ?, encoding?: string)",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_appendfilesync_filename_data_options",
          "!doc": "The synchronous version of fs.appendFile."
        },
        watchFile: {
          "!type": "fn(filename: string, options: ?, listener: fn(current: +fs.Stats, prev: +fs.Stats))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_watchfile_filename_options_listener",
          "!doc": "Watch for changes on filename. The callback listener will be called each time the file is accessed."
        },
        unwatchFile: {
          "!type": "fn(filename: string, listener?: fn())",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_unwatchfile_filename_listener",
          "!doc": "Stop watching for changes on filename. If listener is specified, only that particular listener is removed. Otherwise, all listeners are removed and you have effectively stopped watching filename."
        },
        watch: {
          "!type": "fn(filename: string, options?: ?, listener?: fn(event: string, filename: string)) -> +fs.FSWatcher",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_watch_filename_options_listener",
          "!doc": "Watch for changes on filename, where filename is either a file or a directory. The returned object is a fs.FSWatcher."
        },
        exists: {
          "!type": "fn(path: string, callback?: fn(exists: bool))",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_exists_path_callback",
          "!doc": "Test whether or not the given path exists by checking with the file system. Then call the callback argument with either true or false."
        },
        existsSync: {
          "!type": "fn(path: string) -> bool",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_existssync_path",
          "!doc": "Synchronous version of fs.exists."
        },
        Stats: {
          "!type": "fn()",
          prototype: {
            isFile: "fn() -> bool",
            isDirectory: "fn() -> bool",
            isBlockDevice: "fn() -> bool",
            isCharacterDevice: "fn() -> bool",
            isSymbolicLink: "fn() -> bool",
            isFIFO: "fn() -> bool",
            isSocket: "fn() -> bool",
            dev: "number",
            ino: "number",
            mode: "number",
            nlink: "number",
            uid: "number",
            gid: "number",
            rdev: "number",
            size: "number",
            blksize: "number",
            blocks: "number",
            atime: "+Date",
            mtime: "+Date",
            ctime: "+Date"
          },
          "!url": "http://nodejs.org/api/fs.html#fs_class_fs_stats",
          "!doc": "Objects returned from fs.stat(), fs.lstat() and fs.fstat() and their synchronous counterparts are of this type."
        },
        createReadStream: {
          "!type": "fn(path: string, options?: ?) -> +stream.Readable",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_createreadstream_path_options",
          "!doc": "Returns a new ReadStream object."
        },
        createWriteStream: {
          "!type": "fn(path: string, options?: ?) -> +stream.Writable",
          "!url": "http://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options",
          "!doc": "Returns a new WriteStream object."
        },
        FSWatcher: {
          "!type": "fn()",
          prototype: {
            close: "fn()"
          },
          "!url": "http://nodejs.org/api/fs.html#fs_class_fs_fswatcher",
          "!doc": "Objects returned from fs.watch() are of this type."
        }
      },
      path: {
        normalize: {
          "!type": "fn(p: string) -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_normalize_p",
          "!doc": "Normalize a string path, taking care of '..' and '.' parts."
        },
        join: {
          "!type": "fn() -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_join_path1_path2",
          "!doc": "Join all arguments together and normalize the resulting path."
        },
        resolve: {
          "!type": "fn(from: string, from2: string, from3: string, from4: string, from5: string, to: string) -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_resolve_from_to",
          "!doc": "Resolves to to an absolute path."
        },
        relative: {
          "!type": "fn(from: string, to: string) -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_relative_from_to",
          "!doc": "Solve the relative path from from to to."
        },
        dirname: {
          "!type": "fn(p: string) -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_dirname_p",
          "!doc": "Return the directory name of a path. Similar to the Unix dirname command."
        },
        basename: {
          "!type": "fn(p: string, ext?: string) -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_basename_p_ext",
          "!doc": "Return the last portion of a path. Similar to the Unix basename command."
        },
        extname: {
          "!type": "fn(p: string) -> string",
          "!url": "http://nodejs.org/api/path.html#path_path_extname_p",
          "!doc": "Return the extension of the path, from the last '.' to end of string in the last portion of the path. If there is no '.' in the last portion of the path or the first character of it is '.', then it returns an empty string."
        },
        sep: {
          "!type": "string",
          "!url": "http://nodejs.org/api/path.html#path_path_sep",
          "!doc": "The platform-specific file separator. '\\\\' or '/'."
        },
        delimiter: {
          "!type": "string",
          "!url": "http://nodejs.org/api/path.html#path_path_delimiter",
          "!doc": "The platform-specific path delimiter, ; or ':'."
        }
      },
      string_decoder: {
        StringDecoder: {
          "!type": "fn(encoding?: string)",
          prototype: {
            write: {
              "!type": "fn(buffer: +Buffer) -> string",
              "!url": "http://nodejs.org/api/string_decoder.html#string_decoder_decoder_write_buffer",
              "!doc": "Returns a decoded string."
            },
            end: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/string_decoder.html#string_decoder_decoder_end",
              "!doc": "Returns any trailing bytes that were left in the buffer."
            }
          },
          "!url": "http://nodejs.org/api/string_decoder.html#string_decoder_class_stringdecoder",
          "!doc": "Accepts a single argument, encoding which defaults to utf8."
        }
      },
      tls: {
        CLIENT_RENEG_LIMIT: "number",
        CLIENT_RENEG_WINDOW: "number",
        SLAB_BUFFER_SIZE: "number",
        getCiphers: {
          "!type": "fn() -> [string]",
          "!url": "http://nodejs.org/api/tls.html#tls_tls_getciphers",
          "!doc": "Returns an array with the names of the supported SSL ciphers."
        },
        Server: {
          "!type": "fn()",
          prototype: {
            "!proto": "net.Server.prototype",
            listen: {
              "!type": "fn(port: number, host?: string, callback?: fn())",
              "!url": "http://nodejs.org/api/tls.html#tls_server_listen_port_host_callback",
              "!doc": "Begin accepting connections on the specified port and host. If the host is omitted, the server will accept connections directed to any IPv4 address (INADDR_ANY)."
            },
            close: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/tls.html#tls_server_close",
              "!doc": "Stops the server from accepting new connections. This function is asynchronous, the server is finally closed when the server emits a 'close' event."
            },
            addContext: {
              "!type": "fn(hostName: string, credentials: tls.Server.credentials)",
              "!url": "http://nodejs.org/api/tls.html#tls_server_addcontext_hostname_credentials",
              "!doc": "Add secure context that will be used if client request's SNI hostname is matching passed hostname (wildcards can be used). credentials can contain key, cert and ca."
            }
          },
          "!url": "http://nodejs.org/api/tls.html#tls_class_tls_server",
          "!doc": "This class is a subclass of net.Server and has the same methods on it. Instead of accepting just raw TCP connections, this accepts encrypted connections using TLS or SSL."
        },
        createServer: {
          "!type": "fn(options?: ?, connectionListener?: fn(stream: +tls.CleartextStream)) -> +tls.Server",
          "!url": "http://nodejs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener",
          "!doc": "Creates a new tls.Server. The connectionListener argument is automatically set as a listener for the secureConnection event."
        },
        CleartextStream: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Duplex.prototype",
            authorized: {
              "!type": "bool",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_authorized",
              "!doc": "A boolean that is true if the peer certificate was signed by one of the specified CAs, otherwise false"
            },
            authorizationError: {
              "!type": "+Error",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_authorizationerror",
              "!doc": "The reason why the peer's certificate has not been verified. This property becomes available only when cleartextStream.authorized === false."
            },
            getPeerCertificate: {
              "!type": "fn() -> ?",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_getpeercertificate",
              "!doc": "Returns an object representing the peer's certificate. The returned object has some properties corresponding to the field of the certificate."
            },
            getCipher: {
              "!type": "fn() -> tls.cipher",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_getcipher",
              "!doc": "Returns an object representing the cipher name and the SSL/TLS protocol version of the current connection."
            },
            address: {
              "!type": "net.address",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_address",
              "!doc": "Returns the bound address, the address family name and port of the underlying socket as reported by the operating system. Returns an object with three properties, e.g. { port: 12346, family: 'IPv4', address: '127.0.0.1' }"
            },
            remoteAddress: {
              "!type": "string",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_remoteaddress",
              "!doc": "The string representation of the remote IP address. For example, '74.125.127.100' or '2001:4860:a005::68'."
            },
            remotePort: {
              "!type": "number",
              "!url": "http://nodejs.org/api/tls.html#tls_cleartextstream_remoteport",
              "!doc": "The numeric representation of the remote port. For example, 443."
            }
          },
          "!url": "http://nodejs.org/api/tls.html#tls_class_tls_cleartextstream",
          "!doc": "This is a stream on top of the Encrypted stream that makes it possible to read/write an encrypted data as a cleartext data."
        },
        connect: {
          "!type": "fn(port: number, host?: string, options: ?, listener: fn()) -> +tls.CleartextStream",
          "!url": "http://nodejs.org/api/tls.html#tls_tls_connect_options_callback",
          "!doc": "Creates a new client connection to the given port and host (old API) or options.port and options.host. (If host is omitted, it defaults to localhost.)"
        },
        createSecurePair: {
          "!type": "fn(credentials?: crypto.credentials, isServer?: bool, requestCert?: bool, rejectUnauthorized?: bool) -> +tls.SecurePair",
          "!url": "http://nodejs.org/api/tls.html#tls_tls_createsecurepair_credentials_isserver_requestcert_rejectunauthorized",
          "!doc": "Creates a new secure pair object with two streams, one of which reads/writes encrypted data, and one reads/writes cleartext data. Generally the encrypted one is piped to/from an incoming encrypted data stream, and the cleartext one is used as a replacement for the initial encrypted stream."
        },
        SecurePair: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            cleartext: {
              "!type": "+tls.CleartextStream",
              "!url": "http://nodejs.org/api/tls.html#tls_class_securepair",
              "!doc": "Returned by tls.createSecurePair."
            },
            encrypted: {
              "!type": "+stream.Duplex",
              "!url": "http://nodejs.org/api/tls.html#tls_class_securepair",
              "!doc": "Returned by tls.createSecurePair."
            }
          },
          "!url": "http://nodejs.org/api/tls.html#tls_class_securepair",
          "!doc": "Returned by tls.createSecurePair."
        }
      },
      crypto: {
        getCiphers: {
          "!type": "fn() -> [string]",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_getciphers",
          "!doc": "Returns an array with the names of the supported ciphers."
        },
        getHashes: {
          "!type": "fn() -> [string]",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_gethashes",
          "!doc": "Returns an array with the names of the supported hash algorithms."
        },
        createCredentials: {
          "!type": "fn(details?: ?) -> crypto.credentials",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createcredentials_details",
          "!doc": "Creates a credentials object."
        },
        createHash: {
          "!type": "fn(algorithm: string) -> +crypto.Hash",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm",
          "!doc": "Creates and returns a hash object, a cryptographic hash with the given algorithm which can be used to generate hash digests."
        },
        Hash: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Duplex.prototype",
            update: {
              "!type": "fn(data: +Buffer, encoding?: string)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_hash_update_data_input_encoding",
              "!doc": "Updates the hash content with the given data, the encoding of which is given in input_encoding and can be 'utf8', 'ascii' or 'binary'. If no encoding is provided, then a buffer is expected."
            },
            digest: {
              "!type": "fn(encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_hash_digest_encoding",
              "!doc": "Calculates the digest of all of the passed data to be hashed. The encoding can be 'hex', 'binary' or 'base64'. If no encoding is provided, then a buffer is returned."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_hash",
          "!doc": "The class for creating hash digests of data."
        },
        createHmac: {
          "!type": "fn(algorithm: string, key: string) -> +crypto.Hmac",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createhmac_algorithm_key",
          "!doc": "Creates and returns a hmac object, a cryptographic hmac with the given algorithm and key."
        },
        Hmac: {
          "!type": "fn()",
          prototype: {
            update: {
              "!type": "fn(data: +Buffer)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_hmac_update_data",
              "!doc": "Update the hmac content with the given data. This can be called many times with new data as it is streamed."
            },
            digest: {
              "!type": "fn(encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_hmac_digest_encoding",
              "!doc": "Calculates the digest of all of the passed data to the hmac. The encoding can be 'hex', 'binary' or 'base64'. If no encoding is provided, then a buffer is returned."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_hmac",
          "!doc": "Class for creating cryptographic hmac content."
        },
        createCipher: {
          "!type": "fn(algorithm: string, password: string) -> +crypto.Cipher",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createcipher_algorithm_password",
          "!doc": "Creates and returns a cipher object, with the given algorithm and password."
        },
        createCipheriv: {
          "!type": "fn(algorithm: string, password: string, iv: string) -> +crypto.Cipher",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createcipheriv_algorithm_key_iv",
          "!doc": "Creates and returns a cipher object, with the given algorithm, key and iv."
        },
        Cipher: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Duplex.prototype",
            update: {
              "!type": "fn(data: +Buffer, input_encoding?: string, output_encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_cipher_update_data_input_encoding_output_encoding",
              "!doc": "Updates the cipher with data, the encoding of which is given in input_encoding and can be 'utf8', 'ascii' or 'binary'. If no encoding is provided, then a buffer is expected."
            },
            "final": {
              "!type": "fn(output_encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_cipher_final_output_encoding",
              "!doc": "Returns any remaining enciphered contents, with output_encoding being one of: 'binary', 'base64' or 'hex'. If no encoding is provided, then a buffer is returned."
            },
            setAutoPadding: {
              "!type": "fn(auto_padding: bool)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_cipher_setautopadding_auto_padding_true",
              "!doc": "You can disable automatic padding of the input data to block size. If auto_padding is false, the length of the entire input data must be a multiple of the cipher's block size or final will fail. Useful for non-standard padding, e.g. using 0x0 instead of PKCS padding. You must call this before cipher.final."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_cipher",
          "!doc": "Class for encrypting data."
        },
        createDecipher: {
          "!type": "fn(algorithm: string, password: string) -> +crypto.Decipher",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createdecipher_algorithm_password",
          "!doc": "Creates and returns a decipher object, with the given algorithm and key. This is the mirror of the createCipher() above."
        },
        createDecipheriv: {
          "!type": "fn(algorithm: string, key: string, iv: string) -> +crypto.Decipher",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createdecipheriv_algorithm_key_iv",
          "!doc": "Creates and returns a decipher object, with the given algorithm, key and iv. This is the mirror of the createCipheriv() above."
        },
        Decipher: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Duplex.prototype",
            update: {
              "!type": "fn(data: +Buffer, input_encoding?: string, output_encoding?: string)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_decipher_update_data_input_encoding_output_encoding",
              "!doc": "Updates the decipher with data, which is encoded in 'binary', 'base64' or 'hex'. If no encoding is provided, then a buffer is expected."
            },
            "final": {
              "!type": "fn(output_encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_decipher_final_output_encoding",
              "!doc": "Returns any remaining plaintext which is deciphered, with output_encoding being one of: 'binary', 'ascii' or 'utf8'. If no encoding is provided, then a buffer is returned."
            },
            setAutoPadding: {
              "!type": "fn(auto_padding: bool)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_decipher_setautopadding_auto_padding_true",
              "!doc": "You can disable auto padding if the data has been encrypted without standard block padding to prevent decipher.final from checking and removing it. Can only work if the input data's length is a multiple of the ciphers block size. You must call this before streaming data to decipher.update."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_decipher",
          "!doc": "Class for decrypting data."
        },
        createSign: {
          "!type": "fn(algorithm: string) -> +crypto.Sign",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createsign_algorithm",
          "!doc": "Creates and returns a signing object, with the given algorithm. On recent OpenSSL releases, openssl list-public-key-algorithms will display the available signing algorithms. Examples are 'RSA-SHA256'."
        },
        Sign: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Writable.prototype",
            update: {
              "!type": "fn(data: +Buffer)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_sign_update_data",
              "!doc": "Updates the sign object with data. This can be called many times with new data as it is streamed."
            },
            sign: {
              "!type": "fn(private_key: string, output_format: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_sign_sign_private_key_output_format",
              "!doc": "Calculates the signature on all the updated data passed through the sign. private_key is a string containing the PEM encoded private key for signing."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_sign",
          "!doc": "Class for generating signatures."
        },
        createVerify: {
          "!type": "fn(algorith: string) -> +crypto.Verify",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_createverify_algorithm",
          "!doc": "Creates and returns a verification object, with the given algorithm. This is the mirror of the signing object above."
        },
        Verify: {
          "!type": "fn()",
          prototype: {
            "!proto": "stream.Writable.prototype",
            update: {
              "!type": "fn(data: +Buffer)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_verifier_update_data",
              "!doc": "Updates the verifier object with data. This can be called many times with new data as it is streamed."
            },
            verify: {
              "!type": "fn(object: string, signature: string, signature_format?: string) -> bool",
              "!url": "http://nodejs.org/api/crypto.html#crypto_verifier_verify_object_signature_signature_format",
              "!doc": "Verifies the signed data by using the object and signature. object is a string containing a PEM encoded object, which can be one of RSA public key, DSA public key, or X.509 certificate. signature is the previously calculated signature for the data, in the signature_format which can be 'binary', 'hex' or 'base64'. If no encoding is specified, then a buffer is expected."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_verify",
          "!doc": "Class for verifying signatures."
        },
        createDiffieHellman: {
          "!type": "fn(prime: number, encoding?: string) -> +crypto.DiffieHellman",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_creatediffiehellman_prime_length",
          "!doc": "Creates a Diffie-Hellman key exchange object and generates a prime of the given bit length. The generator used is 2."
        },
        DiffieHellman: {
          "!type": "fn()",
          prototype: {
            generateKeys: {
              "!type": "fn(encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_generatekeys_encoding",
              "!doc": "Generates private and public Diffie-Hellman key values, and returns the public key in the specified encoding. This key should be transferred to the other party. Encoding can be 'binary', 'hex', or 'base64'. If no encoding is provided, then a buffer is returned."
            },
            computeSecret: {
              "!type": "fn(other_public_key: +Buffer, input_encoding?: string, output_encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_computesecret_other_public_key_input_encoding_output_encoding",
              "!doc": "Computes the shared secret using other_public_key as the other party's public key and returns the computed shared secret. Supplied key is interpreted using specified input_encoding, and secret is encoded using specified output_encoding. Encodings can be 'binary', 'hex', or 'base64'. If the input encoding is not provided, then a buffer is expected."
            },
            getPrime: {
              "!type": "fn(encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_getprime_encoding",
              "!doc": "Returns the Diffie-Hellman prime in the specified encoding, which can be 'binary', 'hex', or 'base64'. If no encoding is provided, then a buffer is returned."
            },
            getGenerator: {
              "!type": "fn(encoding: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_getgenerator_encoding",
              "!doc": "Returns the Diffie-Hellman prime in the specified encoding, which can be 'binary', 'hex', or 'base64'. If no encoding is provided, then a buffer is returned."
            },
            getPublicKey: {
              "!type": "fn(encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_getpublickey_encoding",
              "!doc": "Returns the Diffie-Hellman public key in the specified encoding, which can be 'binary', 'hex', or 'base64'. If no encoding is provided, then a buffer is returned."
            },
            getPrivateKey: {
              "!type": "fn(encoding?: string) -> +Buffer",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_getprivatekey_encoding",
              "!doc": "Returns the Diffie-Hellman private key in the specified encoding, which can be 'binary', 'hex', or 'base64'. If no encoding is provided, then a buffer is returned."
            },
            setPublicKey: {
              "!type": "fn(public_key: +Buffer, encoding?: string)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_setpublickey_public_key_encoding",
              "!doc": "Sets the Diffie-Hellman public key. Key encoding can be 'binary', 'hex' or 'base64'. If no encoding is provided, then a buffer is expected."
            },
            setPrivateKey: {
              "!type": "fn(public_key: +Buffer, encoding?: string)",
              "!url": "http://nodejs.org/api/crypto.html#crypto_diffiehellman_setprivatekey_private_key_encoding",
              "!doc": "Sets the Diffie-Hellman private key. Key encoding can be 'binary', 'hex' or 'base64'. If no encoding is provided, then a buffer is expected."
            }
          },
          "!url": "http://nodejs.org/api/crypto.html#crypto_class_diffiehellman",
          "!doc": "The class for creating Diffie-Hellman key exchanges."
        },
        getDiffieHellman: {
          "!type": "fn(group_name: string) -> +crypto.DiffieHellman",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_getdiffiehellman_group_name",
          "!doc": "Creates a predefined Diffie-Hellman key exchange object. The supported groups are: 'modp1', 'modp2', 'modp5' (defined in RFC 2412) and 'modp14', 'modp15', 'modp16', 'modp17', 'modp18' (defined in RFC 3526). The returned object mimics the interface of objects created by crypto.createDiffieHellman() above, but will not allow to change the keys (with diffieHellman.setPublicKey() for example). The advantage of using this routine is that the parties don't have to generate nor exchange group modulus beforehand, saving both processor and communication time."
        },
        pbkdf2: {
          "!type": "fn(password: string, salt: string, iterations: number, keylen: number, callback: fn(err: +Error, derivedKey: string))",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_pbkdf2_password_salt_iterations_keylen_callback",
          "!doc": "Asynchronous PBKDF2 applies pseudorandom function HMAC-SHA1 to derive a key of given length from the given password, salt and iterations. The callback gets two arguments (err, derivedKey)."
        },
        pbkdf2Sync: {
          "!type": "fn(password: string, salt: string, iterations: number, keylen: number) -> string",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_pbkdf2sync_password_salt_iterations_keylen",
          "!doc": "Synchronous PBKDF2 function. Returns derivedKey or throws error."
        },
        randomBytes: {
          "!type": "fn(size: number, callback?: fn(err: +Error, buf: +Buffer))",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_randombytes_size_callback",
          "!doc": "Generates cryptographically strong pseudo-random data."
        },
        pseudoRandomBytes: {
          "!type": "fn(size: number, callback?: fn(err: +Error, buf: +Buffer))",
          "!url": "http://nodejs.org/api/crypto.html#crypto_crypto_pseudorandombytes_size_callback",
          "!doc": "Generates non-cryptographically strong pseudo-random data. The data returned will be unique if it is sufficiently long, but is not necessarily unpredictable. For this reason, the output of this function should never be used where unpredictability is important, such as in the generation of encryption keys."
        },
        DEFAULT_ENCODING: "string"
      },
      util: {
        format: {
          "!type": "fn(format: string) -> string",
          "!url": "http://nodejs.org/api/util.html#util_util_format_format",
          "!doc": "Returns a formatted string using the first argument as a printf-like format."
        },
        debug: {
          "!type": "fn(msg: string)",
          "!url": "http://nodejs.org/api/util.html#util_util_debug_string",
          "!doc": "A synchronous output function. Will block the process and output string immediately to stderr."
        },
        error: {
          "!type": "fn(msg: string)",
          "!url": "http://nodejs.org/api/util.html#util_util_error",
          "!doc": "Same as util.debug() except this will output all arguments immediately to stderr."
        },
        puts: {
          "!type": "fn(data: string)",
          "!url": "http://nodejs.org/api/util.html#util_util_puts",
          "!doc": "A synchronous output function. Will block the process and output all arguments to stdout with newlines after each argument."
        },
        print: {
          "!type": "fn(data: string)",
          "!url": "http://nodejs.org/api/util.html#util_util_print",
          "!doc": "A synchronous output function. Will block the process, cast each argument to a string then output to stdout. Does not place newlines after each argument."
        },
        log: {
          "!type": "fn(string: string)",
          "!url": "http://nodejs.org/api/util.html#util_util_log_string",
          "!doc": "Output with timestamp on stdout."
        },
        inspect: {
          "!type": "fn(object: ?, options: ?) -> string",
          "!url": "http://nodejs.org/api/util.html#util_util_inspect_object_options",
          "!doc": "Return a string representation of object, which is useful for debugging."
        },
        isArray: {
          "!type": "fn(object: ?) -> bool",
          "!url": "http://nodejs.org/api/util.html#util_util_isarray_object",
          "!doc": "Returns true if the given \"object\" is an Array. false otherwise."
        },
        isRegExp: {
          "!type": "fn(object: ?) -> bool",
          "!url": "http://nodejs.org/api/util.html#util_util_isregexp_object",
          "!doc": "Returns true if the given \"object\" is a RegExp. false otherwise."
        },
        isDate: {
          "!type": "fn(object: ?) -> bool",
          "!url": "http://nodejs.org/api/util.html#util_util_isdate_object",
          "!doc": "Returns true if the given \"object\" is a Date. false otherwise."
        },
        isError: {
          "!type": "fn(object: ?) -> bool",
          "!url": "http://nodejs.org/api/util.html#util_util_iserror_object",
          "!doc": "Returns true if the given \"object\" is an Error. false otherwise."
        },
        inherits: {
          "!type": "fn(constructor: ?, superConstructor: ?)",
          "!url": "http://nodejs.org/api/util.html#util_util_inherits_constructor_superconstructor",
          "!doc": "Inherit the prototype methods from one constructor into another. The prototype of constructor will be set to a new object created from superConstructor."
        }
      },
      assert: {
        "!type": "fn(value: ?, message?: string)",
        fail: {
          "!type": "fn(actual: ?, expected: ?, message: string, operator: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_fail_actual_expected_message_operator",
          "!doc": "Throws an exception that displays the values for actual and expected separated by the provided operator."
        },
        ok: {
          "!type": "fn(value: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert",
          "!doc": "This module is used for writing unit tests for your applications, you can access it with require('assert')."
        },
        equal: {
          "!type": "fn(actual: ?, expected: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_equal_actual_expected_message",
          "!doc": "Tests shallow, coercive equality with the equal comparison operator ( == )."
        },
        notEqual: {
          "!type": "fn(actual: ?, expected: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_notequal_actual_expected_message",
          "!doc": "Tests shallow, coercive non-equality with the not equal comparison operator ( != )."
        },
        deepEqual: {
          "!type": "fn(actual: ?, expected: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_deepequal_actual_expected_message",
          "!doc": "Tests for deep equality."
        },
        notDeepEqual: {
          "!type": "fn(acutal: ?, expected: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_notdeepequal_actual_expected_message",
          "!doc": "Tests for any deep inequality."
        },
        strictEqual: {
          "!type": "fn(actual: ?, expected: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_strictequal_actual_expected_message",
          "!doc": "Tests strict equality, as determined by the strict equality operator ( === )"
        },
        notStrictEqual: {
          "!type": "fn(actual: ?, expected: ?, message?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_notstrictequal_actual_expected_message",
          "!doc": "Tests strict non-equality, as determined by the strict not equal operator ( !== )"
        },
        "throws": {
          "!type": "fn(block: fn(), error?: ?, messsage?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_throws_block_error_message",
          "!doc": "Expects block to throw an error. error can be constructor, regexp or validation function."
        },
        doesNotThrow: {
          "!type": "fn(block: fn(), error?: ?, messsage?: string)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_doesnotthrow_block_message",
          "!doc": "Expects block not to throw an error."
        },
        ifError: {
          "!type": "fn(value: ?)",
          "!url": "http://nodejs.org/api/assert.html#assert_assert_iferror_value",
          "!doc": "Tests if value is not a false value, throws if it is a true value. Useful when testing the first argument, error in callbacks."
        },
        "!url": "http://nodejs.org/api/assert.html#assert_assert",
        "!doc": "This module is used for writing unit tests for your applications, you can access it with require('assert')."
      },
      tty: {
        isatty: {
          "!type": "fn(fd: number) -> bool",
          "!url": "http://nodejs.org/api/tty.html#tty_tty_isatty_fd",
          "!doc": "Returns true or false depending on if the fd is associated with a terminal."
        }
      },
      domain: {
        create: {
          "!type": "fn() -> +events.EventEmitter",
          "!url": "http://nodejs.org/api/domain.html#domain_domain_create",
          "!doc": "Returns a new Domain object."
        },
        Domain: {
          "!type": "fn()",
          prototype: {
            "!proto": "events.EventEmitter.prototype",
            run: {
              "!type": "fn(fn: fn())",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_run_fn",
              "!doc": "Run the supplied function in the context of the domain, implicitly binding all event emitters, timers, and lowlevel requests that are created in that context."
            },
            members: {
              "!type": "[+events.EventEmitter]",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_members",
              "!doc": "An array of timers and event emitters that have been explicitly added to the domain."
            },
            add: {
              "!type": "fn(emitter: +events.EventEmitter)",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_add_emitter",
              "!doc": "Explicitly adds an emitter to the domain. If any event handlers called by the emitter throw an error, or if the emitter emits an error event, it will be routed to the domain's error event, just like with implicit binding."
            },
            remove: {
              "!type": "fn(emitter: +events.EventEmitter)",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_remove_emitter",
              "!doc": "The opposite of domain.add(emitter). Removes domain handling from the specified emitter."
            },
            bind: {
              "!type": "fn(callback: fn(err: +Error, data: ?)) -> !0",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_bind_callback",
              "!doc": "The returned function will be a wrapper around the supplied callback function. When the returned function is called, any errors that are thrown will be routed to the domain's error event."
            },
            intercept: {
              "!type": "fn(cb: fn(data: ?)) -> !0",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_intercept_callback",
              "!doc": "This method is almost identical to domain.bind(callback). However, in addition to catching thrown errors, it will also intercept Error objects sent as the first argument to the function."
            },
            dispose: {
              "!type": "fn()",
              "!url": "http://nodejs.org/api/domain.html#domain_domain_dispose",
              "!doc": "The dispose method destroys a domain, and makes a best effort attempt to clean up any and all IO that is associated with the domain. Streams are aborted, ended, closed, and/or destroyed. Timers are cleared. Explicitly bound callbacks are no longer called. Any error events that are raised as a result of this are ignored."
            }
          },
          "!url": "http://nodejs.org/api/domain.html#domain_class_domain",
          "!doc": "The Domain class encapsulates the functionality of routing errors and uncaught exceptions to the active Domain object."
        }
      },
      "os.cpuSpec": {
        model: "string",
        speed: "number",
        times: {
          user: "number",
          nice: "number",
          sys: "number",
          idle: "number",
          irq: "number"
        }
      },
      "process.memoryUsage.type": {
        rss: "number",
        heapTotal: "?",
        number: "?",
        heapUsed: "number"
      },
      "net.address": {
        port: "number",
        family: "string",
        address: "string"
      },
      "url.type": {
        href: "string",
        protocol: "string",
        auth: "string",
        hostname: "string",
        port: "string",
        host: "string",
        pathname: "string",
        search: "string",
        query: "string",
        slashes: "bool",
        hash: "string"
      },
      "tls.Server.credentials": {
        key: "string",
        cert: "string",
        ca: "string"
      },
      "tls.cipher": {
        name: "string",
        version: "string"
      },
      "crypto.credentials": {
        pfx: "string",
        key: "string",
        passphrase: "string",
        cert: "string",
        ca: "string",
        crl: "string",
        ciphers: "string"
      },
      buffer: {
        Buffer: "Buffer",
        INSPECT_MAX_BYTES: "number",
        SlowBuffer: "Buffer"
      },
      module: {},
      timers: {
        setTimeout: {
          "!type": "fn(callback: fn(), ms: number) -> timers.Timer",
          "!url": "http://nodejs.org/api/globals.html#globals_settimeout_cb_ms",
          "!doc": "Run callback cb after at least ms milliseconds. The actual delay depends on external factors like OS timer granularity and system load."
        },
        clearTimeout: {
          "!type": "fn(id: timers.Timer)",
          "!url": "http://nodejs.org/api/globals.html#globals_cleartimeout_t",
          "!doc": "Stop a timer that was previously created with setTimeout(). The callback will not execute."
        },
        setInterval: {
          "!type": "fn(callback: fn(), ms: number) -> timers.Timer",
          "!url": "http://nodejs.org/api/globals.html#globals_setinterval_cb_ms",
          "!doc": "Run callback cb repeatedly every ms milliseconds. Note that the actual interval may vary, depending on external factors like OS timer granularity and system load. It's never less than ms but it may be longer."
        },
        clearInterval: {
          "!type": "fn(id: timers.Timer)",
          "!url": "http://nodejs.org/api/globals.html#globals_clearinterval_t",
          "!doc": "Stop a timer that was previously created with setInterval(). The callback will not execute."
        },
        setImmediate: {
          "!type": "fn(callback: fn()) -> timers.Timer",
          "!url": "http://nodejs.org/api/timers.html#timers_setimmediate_callback_arg",
          "!doc": "Schedule the 'immediate' execution of callback after I/O events callbacks."
        },
        clearImmediate: {
          "!type": "fn(id: timers.Timer)",
          "!url": "http://nodejs.org/api/timers.html#timers_clearimmediate_immediateid",
          "!doc": "Stops an immediate from triggering."
        },
        Timer: {
          unref: {
            "!type": "fn()",
            "!url": "http://nodejs.org/api/timers.html#timers_unref",
            "!doc": "Create a timer that is active but if it is the only item left in the event loop won't keep the program running."
          },
          ref: {
            "!type": "fn()",
            "!url": "http://nodejs.org/api/timers.html#timers_unref",
            "!doc": "Explicitly request the timer hold the program open (cancel the effect of 'unref')."
          }
        }
      }
    },
    process: {
      stdout: {
        "!type": "+stream.Writable",
        "!url": "http://nodejs.org/api/process.html#process_process_stdout",
        "!doc": "A Writable Stream to stdout."
      },
      stderr: {
        "!type": "+stream.Writable",
        "!url": "http://nodejs.org/api/process.html#process_process_stderr",
        "!doc": "A writable stream to stderr."
      },
      stdin: {
        "!type": "+stream.Readable",
        "!url": "http://nodejs.org/api/process.html#process_process_stdin",
        "!doc": "A Readable Stream for stdin. The stdin stream is paused by default, so one must call process.stdin.resume() to read from it."
      },
      argv: {
        "!type": "[string]",
        "!url": "http://nodejs.org/api/process.html#process_process_argv",
        "!doc": "An array containing the command line arguments. The first element will be 'node', the second element will be the name of the JavaScript file. The next elements will be any additional command line arguments."
      },
      execPath: {
        "!type": "string",
        "!url": "http://nodejs.org/api/process.html#process_process_execpath",
        "!doc": "This is the absolute pathname of the executable that started the process."
      },
      abort: {
        "!type": "fn()",
        "!url": "http://nodejs.org/api/process.html#process_process_abort",
        "!doc": "This causes node to emit an abort. This will cause node to exit and generate a core file."
      },
      chdir: {
        "!type": "fn(directory: string)",
        "!url": "http://nodejs.org/api/process.html#process_process_chdir_directory",
        "!doc": "Changes the current working directory of the process or throws an exception if that fails."
      },
      cwd: {
        "!type": "fn()",
        "!url": "http://nodejs.org/api/process.html#process_process_cwd",
        "!doc": "Returns the current working directory of the process."
      },
      env: {
        "!url": "http://nodejs.org/api/process.html#process_process_env",
        "!doc": "An object containing the user environment."
      },
      exit: {
        "!type": "fn(code?: number)",
        "!url": "http://nodejs.org/api/process.html#process_process_exit_code",
        "!doc": "Ends the process with the specified code. If omitted, exit uses the 'success' code 0."
      },
      getgid: {
        "!type": "fn() -> number",
        "!url": "http://nodejs.org/api/process.html#process_process_getgid",
        "!doc": "Gets the group identity of the process. This is the numerical group id, not the group name."
      },
      setgid: {
        "!type": "fn(id: number)",
        "!url": "http://nodejs.org/api/process.html#process_process_setgid_id",
        "!doc": "Sets the group identity of the process. This accepts either a numerical ID or a groupname string. If a groupname is specified, this method blocks while resolving it to a numerical ID."
      },
      getuid: {
        "!type": "fn() -> number",
        "!url": "http://nodejs.org/api/process.html#process_process_getuid",
        "!doc": "Gets the user identity of the process. This is the numerical userid, not the username."
      },
      setuid: {
        "!type": "fn(id: number)",
        "!url": "http://nodejs.org/api/process.html#process_process_setuid_id",
        "!doc": "Sets the user identity of the process. This accepts either a numerical ID or a username string. If a username is specified, this method blocks while resolving it to a numerical ID."
      },
      version: {
        "!type": "string",
        "!url": "http://nodejs.org/api/process.html#process_process_version",
        "!doc": "A compiled-in property that exposes NODE_VERSION."
      },
      versions: {
        http_parser: "string",
        node: "string",
        v8: "string",
        ares: "string",
        uv: "string",
        zlib: "string",
        openssl: "string",
        "!url": "http://nodejs.org/api/process.html#process_process_versions",
        "!doc": "A property exposing version strings of node and its dependencies."
      },
      config: {
        target_defaults: {
          cflags: "[?]",
          default_configuration: "string",
          defines: "[string]",
          include_dirs: "[string]",
          libraries: "[string]"
        },
        variables: {
          clang: "number",
          host_arch: "string",
          node_install_npm: "bool",
          node_install_waf: "bool",
          node_prefix: "string",
          node_shared_openssl: "bool",
          node_shared_v8: "bool",
          node_shared_zlib: "bool",
          node_use_dtrace: "bool",
          node_use_etw: "bool",
          node_use_openssl: "bool",
          target_arch: "string",
          v8_no_strict_aliasing: "number",
          v8_use_snapshot: "bool",
          visibility: "string"
        },
        "!url": "http://nodejs.org/api/process.html#process_process_config",
        "!doc": "An Object containing the JavaScript representation of the configure options that were used to compile the current node executable. This is the same as the \"config.gypi\" file that was produced when running the ./configure script."
      },
      kill: {
        "!type": "fn(pid: number, signal?: string)",
        "!url": "http://nodejs.org/api/process.html#process_process_kill_pid_signal",
        "!doc": "Send a signal to a process. pid is the process id and signal is the string describing the signal to send. Signal names are strings like 'SIGINT' or 'SIGUSR1'. If omitted, the signal will be 'SIGTERM'."
      },
      pid: {
        "!type": "number",
        "!url": "http://nodejs.org/api/process.html#process_process_pid",
        "!doc": "The PID of the process."
      },
      title: {
        "!type": "string",
        "!url": "http://nodejs.org/api/process.html#process_process_title",
        "!doc": "Getter/setter to set what is displayed in 'ps'."
      },
      arch: {
        "!type": "string",
        "!url": "http://nodejs.org/api/process.html#process_process_arch",
        "!doc": "What processor architecture you're running on: 'arm', 'ia32', or 'x64'."
      },
      platform: {
        "!type": "string",
        "!url": "http://nodejs.org/api/process.html#process_process_platform",
        "!doc": "What platform you're running on: 'darwin', 'freebsd', 'linux', 'sunos' or 'win32'"
      },
      memoryUsage: {
        "!type": "fn() -> process.memoryUsage.type",
        "!url": "http://nodejs.org/api/process.html#process_process_memoryusage",
        "!doc": "Returns an object describing the memory usage of the Node process measured in bytes."
      },
      nextTick: {
        "!type": "fn(callback: fn())",
        "!url": "http://nodejs.org/api/process.html#process_process_nexttick_callback",
        "!doc": "On the next loop around the event loop call this callback. This is not a simple alias to setTimeout(fn, 0), it's much more efficient. It typically runs before any other I/O events fire, but there are some exceptions."
      },
      maxTickDepth: {
        "!type": "number",
        "!url": "http://nodejs.org/api/process.html#process_process_maxtickdepth",
        "!doc": "The maximum depth of nextTick-calling nextTick-callbacks that will be evaluated before allowing other forms of I/O to occur."
      },
      umask: {
        "!type": "fn(mask?: number) -> number",
        "!url": "http://nodejs.org/api/process.html#process_process_umask_mask",
        "!doc": "Sets or reads the process's file mode creation mask. Child processes inherit the mask from the parent process. Returns the old mask if mask argument is given, otherwise returns the current mask."
      },
      uptime: {
        "!type": "fn() -> number",
        "!url": "http://nodejs.org/api/process.html#process_process_uptime",
        "!doc": "Number of seconds Node has been running."
      },
      hrtime: {
        "!type": "fn() -> [number]",
        "!url": "http://nodejs.org/api/process.html#process_process_hrtime",
        "!doc": "Returns the current high-resolution real time in a [seconds, nanoseconds] tuple Array. It is relative to an arbitrary time in the past. It is not related to the time of day and therefore not subject to clock drift. The primary use is for measuring performance between intervals."
      },
      "!url": "http://nodejs.org/api/globals.html#globals_process",
      "!doc": "The process object."
    },
    global: {
      "!type": "<top>",
      "!url": "http://nodejs.org/api/globals.html#globals_global",
      "!doc": "In browsers, the top-level scope is the global scope. That means that in browsers if you're in the global scope var something will define a global variable. In Node this is different. The top-level scope is not the global scope; var something inside a Node module will be local to that module."
    },
    console: {
      log: {
        "!type": "fn(text: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_log_data",
        "!doc": "Prints to stdout with newline. This function can take multiple arguments in a printf()-like way."
      },
      info: {
        "!type": "fn(text: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_info_data",
        "!doc": "Same as console.log."
      },
      error: {
        "!type": "fn(text: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_error_data",
        "!doc": "Same as console.log but prints to stderr."
      },
      warn: {
        "!type": "fn(text: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_warn_data",
        "!doc": "Same as console.error."
      },
      dir: {
        "!type": "fn(obj: ?)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_dir_obj",
        "!doc": "Uses util.inspect on obj and prints resulting string to stdout."
      },
      time: {
        "!type": "fn(label: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_time_label",
        "!doc": "Mark a time."
      },
      timeEnd: {
        "!type": "fn(label: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_timeend_label",
        "!doc": "Finish timer, record output."
      },
      trace: {
        "!type": "fn(label: string)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_trace_label",
        "!doc": "Print a stack trace to stderr of the current position."
      },
      assert: {
        "!type": "fn(expression: bool)",
        "!url": "http://nodejs.org/api/stdio.html#stdio_console_assert_expression_message",
        "!doc": "Same as assert.ok() where if the expression evaluates as false throw an AssertionError with message."
      },
      "!url": "http://nodejs.org/api/globals.html#globals_console",
      "!doc": "Used to print to stdout and stderr."
    },
    __filename: {
      "!type": "string",
      "!url": "http://nodejs.org/api/globals.html#globals_filename",
      "!doc": "The filename of the code being executed. This is the resolved absolute path of this code file. For a main program this is not necessarily the same filename used in the command line. The value inside a module is the path to that module file."
    },
    __dirname: {
      "!type": "string",
      "!url": "http://nodejs.org/api/globals.html#globals_dirname",
      "!doc": "The name of the directory that the currently executing script resides in."
    },
    setTimeout: "timers.setTimeout",
    clearTimeout: "timers.clearTimeout",
    setInterval: "timers.setInterval",
    clearInterval: "timers.clearInterval",
    module: {
      "!type": "+Module",
      "!url": "http://nodejs.org/api/globals.html#globals_module",
      "!doc": "A reference to the current module. In particular module.exports is the same as the exports object. module isn't actually a global but rather local to each module."
    },
    Buffer: {
      "!type": "fn(str: string, encoding?: string) -> +Buffer",
      prototype: {
        "!proto": "String.prototype",
        write: "fn(string: string, offset?: number, length?: number, encoding?: string) -> number",
        toString: "fn(encoding?: string, start?: number, end?: number) -> string",
        length: "number",
        copy: "fn(targetBuffer: +Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number)",
        slice: "fn(start?: number, end?: number) -> +Buffer",
        readUInt8: "fn(offset: number, noAssert?: bool) -> number",
        readUInt16LE: "fn(offset: number, noAssert?: bool) -> number",
        readUInt16BE: "fn(offset: number, noAssert?: bool) -> number",
        readUInt32LE: "fn(offset: number, noAssert?: bool) -> number",
        readUInt32BE: "fn(offset: number, noAssert?: bool) -> number",
        readInt8: "fn(offset: number, noAssert?: bool) -> number",
        readInt16LE: "fn(offset: number, noAssert?: bool) -> number",
        readInt16BE: "fn(offset: number, noAssert?: bool) -> number",
        readInt32LE: "fn(offset: number, noAssert?: bool) -> number",
        readInt32BE: "fn(offset: number, noAssert?: bool) -> number",
        readFloatLE: "fn(offset: number, noAssert?: bool) -> number",
        readFloatBE: "fn(offset: number, noAssert?: bool) -> number",
        readDoubleLE: "fn(offset: number, noAssert?: bool) -> number",
        readDoubleBE: "fn(offset: number, noAssert?: bool) -> number",
        writeUInt8: "fn(value: number, offset: number, noAssert?: bool)",
        writeUInt16LE: "fn(value: number, offset: number, noAssert?: bool)",
        writeUInt16BE: "fn(value: number, offset: number, noAssert?: bool)",
        writeUInt32LE: "fn(value: number, offset: number, noAssert?: bool)",
        writeUInt32BE: "fn(value: number, offset: number, noAssert?: bool)",
        writeInt8: "fn(value: number, offset: number, noAssert?: bool)",
        writeInt16LE: "fn(value: number, offset: number, noAssert?: bool)",
        writeInt16BE: "fn(value: number, offset: number, noAssert?: bool)",
        writeInt32LE: "fn(value: number, offset: number, noAssert?: bool)",
        writeInt32BE: "fn(value: number, offset: number, noAssert?: bool)",
        writeFloatLE: "fn(value: number, offset: number, noAssert?: bool)",
        writeFloatBE: "fn(value: number, offset: number, noAssert?: bool)",
        writeDoubleLE: "fn(value: number, offset: number, noAssert?: bool)",
        writeDoubleBE: "fn(value: number, offset: number, noAssert?: bool)",
        fill: "fn(value: ?, offset?: number, end?: number)"
      },
      isBuffer: "fn(obj: ?) -> bool",
      byteLength: "fn(string: string, encoding?: string) -> number",
      concat: "fn(list: [+Buffer], totalLength?: number) -> +Buffer",
      "!url": "http://nodejs.org/api/globals.html#globals_class_buffer",
      "!doc": "Used to handle binary data."
    }
  };
});

//#endregion


//#region tern/plugin/doc_comment.js

// Parses comments above variable declarations, function declarations,
// and object properties as docstrings and JSDoc-style type
// annotations.

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"), require("../lib/comment"),
               require("acorn/acorn"), require("acorn/util/walk"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern", "../lib/comment", "acorn/acorn", "acorn/util/walk"], mod);
  mod(tern, tern, tern.comment, acorn, acorn.walk);
})(function(infer, tern, comment, acorn, walk) {
  "use strict";

  var WG_MADEUP = 1, WG_STRONG = 101;

  tern.registerPlugin("doc_comment", function(server, options) {
    server.jsdocTypedefs = Object.create(null);
    server.on("reset", function() {
      server.jsdocTypedefs = Object.create(null);
    });
    server._docComment = {
      weight: options && options.strong ? WG_STRONG : undefined,
      fullDocs: options && options.fullDocs
    };

    return {
      passes: {
        postParse: postParse,
        postInfer: postInfer,
        postLoadDef: postLoadDef
      }
    };
  });

  function postParse(ast, text) {
    function attachComments(node) { comment.ensureCommentsBefore(text, node); }

    walk.simple(ast, {
      VariableDeclaration: attachComments,
      FunctionDeclaration: attachComments,
      AssignmentExpression: function(node) {
        if (node.operator == "=") attachComments(node);
      },
      ObjectExpression: function(node) {
        for (var i = 0; i < node.properties.length; ++i)
          attachComments(node.properties[i]);
      },
      CallExpression: function(node) {
        if (isDefinePropertyCall(node)) attachComments(node);
      }
    });
  }

  function isDefinePropertyCall(node) {
    return node.callee.type == "MemberExpression" &&
      node.callee.object.name == "Object" &&
      node.callee.property.name == "defineProperty" &&
      node.arguments.length >= 3 &&
      typeof node.arguments[1].value == "string";
  }

  function postInfer(ast, scope) {
    jsdocParseTypedefs(ast.sourceFile.text, scope);

    walk.simple(ast, {
      VariableDeclaration: function(node, scope) {
        if (node.commentsBefore)
          interpretComments(node, node.commentsBefore, scope,
                            scope.getProp(node.declarations[0].id.name));
      },
      FunctionDeclaration: function(node, scope) {
        if (node.commentsBefore)
          interpretComments(node, node.commentsBefore, scope,
                            scope.getProp(node.id.name),
                            node.body.scope.fnType);
      },
      AssignmentExpression: function(node, scope) {
        if (node.commentsBefore)
          interpretComments(node, node.commentsBefore, scope,
                            infer.expressionType({node: node.left, state: scope}));
      },
      ObjectExpression: function(node, scope) {
        for (var i = 0; i < node.properties.length; ++i) {
          var prop = node.properties[i];
          if (prop.commentsBefore)
            interpretComments(prop, prop.commentsBefore, scope,
                              node.objType.getProp(prop.key.name));
        }
      },
      CallExpression: function(node, scope) {
        if (node.commentsBefore && isDefinePropertyCall(node)) {
          var type = infer.expressionType({node: node.arguments[0], state: scope}).getObjType();
          if (type && type instanceof infer.Obj) {
            var prop = type.props[node.arguments[1].value];
            if (prop) interpretComments(node, node.commentsBefore, scope, prop);
          }
        }
      }
    }, infer.searchVisitor, scope);
  }

  function postLoadDef(data) {
    var defs = data["!typedef"];
    var cx = infer.cx(), orig = data["!name"];
    if (defs) for (var name in defs)
      cx.parent.jsdocTypedefs[name] =
        maybeInstance(infer.def.parse(defs[name], orig, name), name);
  }

  // COMMENT INTERPRETATION

  function interpretComments(node, comments, scope, aval, type) {
    jsdocInterpretComments(node, scope, aval, comments);
    var cx = infer.cx();

    if (!type && aval instanceof infer.AVal && aval.types.length) {
      type = aval.types[aval.types.length - 1];
      if (!(type instanceof infer.Obj) || type.origin != cx.curOrigin || type.doc)
        type = null;
    }

    var result = comments[comments.length - 1];
    if (cx.parent._docComment.fullDocs) {
      result = result.trim().replace(/\n[ \t]*\* ?/g, "\n");
    } else {
      var dot = result.search(/\.\s/);
      if (dot > 5) result = result.slice(0, dot + 1);
      result = result.trim().replace(/\s*\n\s*\*\s*|\s{1,}/g, " ");
    }
    result = result.replace(/^\s*\*+\s*/, "");

    if (aval instanceof infer.AVal) aval.doc = result;
    if (type) type.doc = result;
  }

  // Parses a subset of JSDoc-style comments in order to include the
  // explicitly defined types in the analysis.

  function skipSpace(str, pos) {
    while (/\s/.test(str.charAt(pos))) ++pos;
    return pos;
  }

  function isIdentifier(string) {
    if (!acorn.isIdentifierStart(string.charCodeAt(0))) return false;
    for (var i = 1; i < string.length; i++)
      if (!acorn.isIdentifierChar(string.charCodeAt(i))) return false;
    return true;
  }

  function parseLabelList(scope, str, pos, close) {
    var labels = [], types = [], madeUp = false;
    for (var first = true; ; first = false) {
      pos = skipSpace(str, pos);
      if (first && str.charAt(pos) == close) break;
      var colon = str.indexOf(":", pos);
      if (colon < 0) return null;
      var label = str.slice(pos, colon);
      if (!isIdentifier(label)) return null;
      labels.push(label);
      pos = colon + 1;
      var type = parseType(scope, str, pos);
      if (!type) return null;
      pos = type.end;
      madeUp = madeUp || type.madeUp;
      types.push(type.type);
      pos = skipSpace(str, pos);
      var next = str.charAt(pos);
      ++pos;
      if (next == close) break;
      if (next != ",") return null;
    }
    return {labels: labels, types: types, end: pos, madeUp: madeUp};
  }

  function parseType(scope, str, pos) {
    var type, union = false, madeUp = false;
    for (;;) {
      var inner = parseTypeInner(scope, str, pos);
      if (!inner) return null;
      madeUp = madeUp || inner.madeUp;
      if (union) inner.type.propagate(union);
      else type = inner.type;
      pos = skipSpace(str, inner.end);
      if (str.charAt(pos) != "|") break;
      pos++;
      if (!union) {
        union = new infer.AVal;
        type.propagate(union);
        type = union;
      }
    }
    var isOptional = false;
    if (str.charAt(pos) == "=") {
      ++pos;
      isOptional = true;
    }
    return {type: type, end: pos, isOptional: isOptional, madeUp: madeUp};
  }

  function parseTypeInner(scope, str, pos) {
    pos = skipSpace(str, pos);
    var type, madeUp = false;

    if (str.indexOf("function(", pos) == pos) {
      var args = parseLabelList(scope, str, pos + 9, ")"), ret = infer.ANull;
      if (!args) return null;
      pos = skipSpace(str, args.end);
      if (str.charAt(pos) == ":") {
        ++pos;
        var retType = parseType(scope, str, pos + 1);
        if (!retType) return null;
        pos = retType.end;
        ret = retType.type;
        madeUp = retType.madeUp;
      }
      type = new infer.Fn(null, infer.ANull, args.types, args.labels, ret);
    } else if (str.charAt(pos) == "[") {
      var inner = parseType(scope, str, pos + 1);
      if (!inner) return null;
      pos = skipSpace(str, inner.end);
      madeUp = inner.madeUp;
      if (str.charAt(pos) != "]") return null;
      ++pos;
      type = new infer.Arr(inner.type);
    } else if (str.charAt(pos) == "{") {
      var fields = parseLabelList(scope, str, pos + 1, "}");
      if (!fields) return null;
      type = new infer.Obj(true);
      for (var i = 0; i < fields.types.length; ++i) {
        var field = type.defProp(fields.labels[i]);
        field.initializer = true;
        fields.types[i].propagate(field);
      }
      pos = fields.end;
      madeUp = fields.madeUp;
    } else if (str.charAt(pos) == "(") {
      var inner = parseType(scope, str, pos + 1);
      if (!inner) return null;
      pos = skipSpace(str, inner.end);
      if (str.charAt(pos) != ")") return null;
      ++pos;
      type = inner.type;
    } else {
      var start = pos;
      if (!acorn.isIdentifierStart(str.charCodeAt(pos))) return null;
      while (acorn.isIdentifierChar(str.charCodeAt(pos))) ++pos;
      if (start == pos) return null;
      var word = str.slice(start, pos);
      if (/^(number|integer)$/i.test(word)) type = infer.cx().num;
      else if (/^bool(ean)?$/i.test(word)) type = infer.cx().bool;
      else if (/^string$/i.test(word)) type = infer.cx().str;
      else if (/^(null|undefined)$/i.test(word)) type = infer.ANull;
      else if (/^array$/i.test(word)) {
        var inner = null;
        if (str.charAt(pos) == "." && str.charAt(pos + 1) == "<") {
          var inAngles = parseType(scope, str, pos + 2);
          if (!inAngles) return null;
          pos = skipSpace(str, inAngles.end);
          madeUp = inAngles.madeUp;
          if (str.charAt(pos++) != ">") return null;
          inner = inAngles.type;
        }
        type = new infer.Arr(inner);
      } else if (/^object$/i.test(word)) {
        type = new infer.Obj(true);
        if (str.charAt(pos) == "." && str.charAt(pos + 1) == "<") {
          var key = parseType(scope, str, pos + 2);
          if (!key) return null;
          pos = skipSpace(str, key.end);
          madeUp = madeUp || key.madeUp;
          if (str.charAt(pos++) != ",") return null;
          var val = parseType(scope, str, pos);
          if (!val) return null;
          pos = skipSpace(str, val.end);
          madeUp = key.madeUp || val.madeUp;
          if (str.charAt(pos++) != ">") return null;
          val.type.propagate(type.defProp("<i>"));
        }
      } else {
        while (str.charCodeAt(pos) == 46 ||
               acorn.isIdentifierChar(str.charCodeAt(pos))) ++pos;
        var path = str.slice(start, pos);
        var cx = infer.cx(), defs = cx.parent && cx.parent.jsdocTypedefs, found;
        if (defs && (path in defs)) {
          type = defs[path];
        } else if (found = infer.def.parsePath(path, scope).getObjType()) {
          type = maybeInstance(found, path);
        } else {
          if (!cx.jsdocPlaceholders) cx.jsdocPlaceholders = Object.create(null);
          if (!(path in cx.jsdocPlaceholders))
            type = cx.jsdocPlaceholders[path] = new infer.Obj(null, path);
          else
            type = cx.jsdocPlaceholders[path];
          madeUp = true;
        }
      }
    }

    return {type: type, end: pos, madeUp: madeUp};
  }

  function maybeInstance(type, path) {
    if (type instanceof infer.Fn && /^[A-Z]/.test(path)) {
      var proto = type.getProp("prototype").getObjType();
      if (proto instanceof infer.Obj) return infer.getInstance(proto);
    }
    return type;
  }

  function parseTypeOuter(scope, str, pos) {
    pos = skipSpace(str, pos || 0);
    if (str.charAt(pos) != "{") return null;
    var result = parseType(scope, str, pos + 1);
    if (!result) return null;
    var end = skipSpace(str, result.end);
    if (str.charAt(end) != "}") return null;
    result.end = end + 1;
    return result;
  }

  function jsdocInterpretComments(node, scope, aval, comments) {
    var type, args, ret, foundOne, self, parsed;

    for (var i = 0; i < comments.length; ++i) {
      var comment = comments[i];
      var decl = /(?:\n|$|\*)\s*@(type|param|arg(?:ument)?|returns?|this)\s+(.*)/g, m;
      while (m = decl.exec(comment)) {
        if (m[1] == "this" && (parsed = parseType(scope, m[2], 0))) {
          self = parsed;
          foundOne = true;
          continue;
        }

        if (!(parsed = parseTypeOuter(scope, m[2]))) continue;
        foundOne = true;

        switch(m[1]) {
        case "returns": case "return":
          ret = parsed; break;
        case "type":
          type = parsed; break;
        case "param": case "arg": case "argument":
            var name = m[2].slice(parsed.end).match(/^\s*(\[?)\s*([^\]\s]+)\s*(\]?).*/);
            if (!name) continue;
            var argname = name[2] + (parsed.isOptional || (name[1] === '[' && name[3] === ']') ? "?" : "");
          (args || (args = Object.create(null)))[argname] = parsed;
          break;
        }
      }
    }

    if (foundOne) applyType(type, self, args, ret, node, aval);
  };

  function jsdocParseTypedefs(text, scope) {
    var cx = infer.cx();

    var re = /\s@typedef\s+(.*)/g, m;
    while (m = re.exec(text)) {
      var parsed = parseTypeOuter(scope, m[1]);
      var name = parsed && m[1].slice(parsed.end).match(/^\s*(\S+)/);
      if (name)
        cx.parent.jsdocTypedefs[name[1]] = parsed.type;
    }
  }

  function propagateWithWeight(type, target) {
    var weight = infer.cx().parent._docComment.weight;
    type.type.propagate(target, weight || (type.madeUp ? WG_MADEUP : undefined));
  }

  function applyType(type, self, args, ret, node, aval) {
    var fn;
    if (node.type == "VariableDeclaration") {
      var decl = node.declarations[0];
      if (decl.init && decl.init.type == "FunctionExpression") fn = decl.init.body.scope.fnType;
    } else if (node.type == "FunctionDeclaration") {
      fn = node.body.scope.fnType;
    } else if (node.type == "AssignmentExpression") {
      if (node.right.type == "FunctionExpression")
        fn = node.right.body.scope.fnType;
    } else if (node.type == "CallExpression") {
    } else { // An object property
      if (node.value.type == "FunctionExpression") fn = node.value.body.scope.fnType;
    }

    if (fn && (args || ret || self)) {
      if (args) for (var i = 0; i < fn.argNames.length; ++i) {
        var name = fn.argNames[i], known = args[name];
        if (!known && (known = args[name + "?"]))
          fn.argNames[i] += "?";
        if (known) propagateWithWeight(known, fn.args[i]);
      }
      if (ret) propagateWithWeight(ret, fn.retval);
      if (self) propagateWithWeight(self, fn.self);
    } else if (type) {
      propagateWithWeight(type, aval);
    }
  };
});

//#endregion


//#region tern/plugin/complete_strings.js

// Parses comments above variable declarations, function declarations,
// and object properties as docstrings and JSDoc-style type
// annotations.

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"), require("acorn/util/walk"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern", "acorn/util/walk"], mod);
  mod(tern, tern, acorn.walk);
})(function(infer, tern, walk) {
  "use strict";

  tern.registerPlugin("complete_strings", function(server, options) {
    server._completeStrings = { maxLen: options && options.maxLength || 15,
                                seen: Object.create(null) };
    server.on("reset", function() {
      server._completeStrings.seen = Object.create(null);
    });
    return {
      passes: {
        postParse: postParse,
        completion: complete
      }
    };
  });

  function postParse(ast) {
    var data = infer.cx().parent._completeStrings;
    walk.simple(ast, {
      Literal: function(node) {
        if (typeof node.value == "string" && node.value && node.value.length < data.maxLen)
          data.seen[node.value] = ast.sourceFile.name;
      }
    });
  }

  function complete(file, query) {
    var pos = tern.resolvePos(file, query.end);
    var lit = infer.findExpressionAround(file.ast, null, pos, file.scope, "Literal");
    if (!lit || typeof lit.node.value != "string") return;
    var before = lit.node.value.slice(0, pos - lit.node.start - 1);
    var matches = [], seen = infer.cx().parent._completeStrings.seen;
    for (var str in seen) if (str.length > before.length && str.indexOf(before) == 0) {
      if (query.types || query.docs || query.urls || query.origins) {
        var rec = {name: JSON.stringify(str), displayName: str};
        matches.push(rec);
        if (query.types) rec.type = "string";
        if (query.origins) rec.origin = seen[str];
      } else {
        matches.push(JSON.stringify(str));
      }
    }
    if (matches.length) return {
      start: tern.outputPos(query, file, lit.node.start),
      end: tern.outputPos(query, file, pos + (file.text.charAt(pos) == file.text.charAt(lit.node.start) ? 1 : 0)),
      isProperty: false,
      completions: matches
    };
  }
});

//#endregion


//#region tern/plugin/angular.js

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    return mod(require("../lib/infer"), require("../lib/tern"), require("../lib/comment"),
               require("acorn/util/walk"));
  if (typeof define == "function" && define.amd) // AMD
    return define(["../lib/infer", "../lib/tern", "../lib/comment", "acorn/util/walk"], mod);
  mod(tern, tern, tern.comment, acorn.walk);
})(function(infer, tern, comment, walk) {
  "use strict";

  var SetDoc = infer.constraint("doc", {
    addType: function(type) {
      if (!type.doc) type.doc = this.doc;
    }
  });

  function Injector() {
    this.fields = Object.create(null);
    this.forward = [];
  }

  Injector.prototype.get = function(name) {
    if (name == "$scope") return new infer.Obj(globalInclude("$rootScope").getType(), "$scope");
    if (name in this.fields) return this.fields[name];
    var field = this.fields[name] = new infer.AVal;
    return field;
  };
  Injector.prototype.set = function(name, val, doc, node, depth) {
    if (name == "$scope" || depth && depth > 10) return;
    var field = this.fields[name] || (this.fields[name] = new infer.AVal);
    if (!depth) field.local = true;
    if (!field.origin) field.origin = infer.cx().curOrigin;
    if (typeof node == "string" && !field.span) field.span = node;
    else if (node && typeof node == "object" && !field.originNode) field.originNode = node;
    if (doc) { field.doc = doc; field.propagate(new SetDoc(doc)); }
    val.propagate(field);
    for (var i = 0; i < this.forward.length; ++i)
      this.forward[i].set(name, val, doc, node, (depth || 0) + 1);
  };
  Injector.prototype.forwardTo = function(injector) {
    this.forward.push(injector);
    for (var field in this.fields) {
      var val = this.fields[field];
      injector.set(field, val, val.doc, val.span || val.originNode, 1);
    }
  };

  function globalInclude(name) {
    var service = infer.cx().definitions.angular.service;
    if (service.hasProp(name)) return service.getProp(name);
  }

  function getInclude(mod, name) {
    var glob = globalInclude(name);
    if (glob) return glob;
    if (!mod.injector) return infer.ANull;
    return mod.injector ? mod.injector.get(name) : infer.ANull;
  }

  function applyWithInjection(mod, fnType, node, asNew) {
    var deps = [];
    if (node.type == "FunctionExpression") {
      for (var i = 0; i < node.params.length; ++i)
        deps.push(getInclude(mod, node.params[i].name));
    } else if (node.type == "ArrayExpression") {
      for (var i = 0; i < node.elements.length - 1; ++i) {
        var elt = node.elements[i];
        if (elt.type == "Literal" && typeof elt.value == "string")
          deps.push(getInclude(mod, elt.value));
        else
          deps.push(infer.ANull);
      }
      var last = node.elements[node.elements.length - 1];
      if (last && last.type == "FunctionExpression")
        fnType = last.body.scope.fnType;
    }
    var result = new infer.AVal;
    if (asNew) {
      var self = new infer.AVal;
      fnType.propagate(new infer.IsCtor(self));
      self.propagate(result, 90);
      fnType.propagate(new infer.IsCallee(self, deps, null, new infer.IfObj(result)));
    } else {
      fnType.propagate(new infer.IsCallee(infer.cx().topScope, deps, null, result));
    }
    return result;
  }

  infer.registerFunction("angular_callInject", function(argN) {
    return function(self, args, argNodes) {
      var mod = self.getType();
      if (mod && argNodes && argNodes[argN])
        applyWithInjection(mod, args[argN], argNodes[argN]);
    };
  });

  infer.registerFunction("angular_regFieldCall", function(self, args, argNodes) {
    var mod = self.getType();
    if (mod && argNodes && argNodes.length > 1) {
      var result = applyWithInjection(mod, args[1], argNodes[1]);
      if (mod.injector && argNodes[0].type == "Literal")
        mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0]);
    }
  });

  infer.registerFunction("angular_regFieldNew", function(self, args, argNodes) {
    var mod = self.getType();
    if (mod && argNodes && argNodes.length > 1) {
      var result = applyWithInjection(mod, args[1], argNodes[1], true);
      if (mod.injector && argNodes[0].type == "Literal")
        mod.injector.set(argNodes[0].value, result, argNodes[0].angularDoc, argNodes[0]);
    }
  });

  infer.registerFunction("angular_regField", function(self, args, argNodes) {
    var mod = self.getType();
    if (mod && mod.injector && argNodes && argNodes[0] && argNodes[0].type == "Literal" && args[1])
      mod.injector.set(argNodes[0].value, args[1], argNodes[0].angularDoc, argNodes[0]);
  });

  function arrayNodeToStrings(node) {
    var strings = [];
    if (node && node.type == "ArrayExpression")
      for (var i = 0; i < node.elements.length; ++i) {
        var elt = node.elements[i];
        if (elt.type == "Literal" && typeof elt.value == "string")
          strings.push(elt.value);
      }
    return strings;
  }

  function moduleProto(cx) {
    var ngDefs = cx.definitions.angular;
    return ngDefs && ngDefs.Module.getProp("prototype").getType();
  }

  function declareMod(name, includes) {
    var cx = infer.cx(), data = cx.parent._angular;
    var proto = moduleProto(cx);
    var mod = new infer.Obj(proto || true);
    if (!proto) data.nakedModules.push(mod);
    mod.origin = cx.curOrigin;
    mod.injector = new Injector();
    mod.metaData = {includes: includes};
    for (var i = 0; i < includes.length; ++i) {
      var depMod = data.modules[includes[i]];
      if (!depMod)
        (data.pendingImports[includes[i]] || (data.pendingImports[includes[i]] = [])).push(mod.injector);
      else if (depMod.injector)
        depMod.injector.forwardTo(mod.injector);
    }
    if (typeof name == "string") {
      data.modules[name] = mod;
      var pending = data.pendingImports[name];
      if (pending) {
        delete data.pendingImports[name];
        for (var i = 0; i < pending.length; ++i)
          mod.injector.forwardTo(pending[i]);
      }
    }
    return mod;
  }

  infer.registerFunction("angular_module", function(_self, _args, argNodes) {
    var mod, name = argNodes && argNodes[0] && argNodes[0].type == "Literal" && argNodes[0].value;
    if (typeof name == "string")
      mod = infer.cx().parent._angular.modules[name];
    if (!mod)
      mod = declareMod(name, arrayNodeToStrings(argNodes && argNodes[1]));
    return mod;
  });

  var IsBound = infer.constraint("self, args, target", {
    addType: function(tp) {
      if (!(tp instanceof infer.Fn)) return;
      this.target.addType(new infer.Fn(tp.name, tp.self, tp.args.slice(this.args.length),
                                       tp.argNames.slice(this.args.length), tp.retval));
      this.self.propagate(tp.self);
      for (var i = 0; i < Math.min(tp.args.length, this.args.length); ++i)
        this.args[i].propagate(tp.args[i]);
    }
  });

  infer.registerFunction("angular_bind", function(_self, args) {
    if (args.length < 2) return infer.ANull;
    var result = new infer.AVal;
    args[1].propagate(new IsBound(args[0], args.slice(2), result));
    return result;
  });

  function postParse(ast, text) {
    walk.simple(ast, {
      CallExpression: function(node) {
        if (node.callee.type == "MemberExpression" &&
            !node.callee.computed && node.arguments.length &&
            /^(value|constant|controller|factory|provider)$/.test(node.callee.property.name)) {
          var before = comment.commentsBefore(text, node.callee.property.start - 1);
          if (before) {
            var first = before[0], dot = first.search(/\.\s/);
            if (dot > 5) first = first.slice(0, dot + 1);
            first = first.trim().replace(/\s*\n\s*\*\s*|\s{1,}/g, " ");
            node.arguments[0].angularDoc = first;
          }
        }
      }
    });
  }

  function postLoadDef(json) {
    var cx = infer.cx(), defName = json["!name"], defs = cx.definitions[defName];
    if (defName == "angular") {
      var proto = moduleProto(cx), naked = cx.parent._angular.nakedModules;
      if (proto) for (var i = 0; i < naked.length; ++i) naked[i].proto = proto;
      return;
    }
    var mods = defs && defs["!ng"];
    if (mods) for (var name in mods.props) {
      var obj = mods.props[name].getType();
      var mod = declareMod(name.replace(/`/g, "."), obj.metaData && obj.metaData.includes || []);
      mod.origin = defName;
      for (var prop in obj.props) {
        var val = obj.props[prop], tp = val.getType();
        if (!tp) continue;
        if (/^_inject_/.test(prop)) {
          if (!tp.name) tp.name = prop.slice(8);
          mod.injector.set(prop.slice(8), tp, val.doc, val.span);
        } else {
          obj.props[prop].propagate(mod.defProp(prop));
        }
      }
    }
  }

  function preCondenseReach(state) {
    var mods = infer.cx().parent._angular.modules;
    var modObj = new infer.Obj(null), found = 0;
    for (var name in mods) {
      var mod = mods[name];
      if (state.origins.indexOf(mod.origin) > -1) {
        var propName = name.replace(/\./g, "`");
        modObj.defProp(propName).addType(mod);
        mod.condenseForceInclude = true;
        ++found;
        if (mod.injector) for (var inj in mod.injector.fields) {
          var field = mod.injector.fields[inj];
          if (field.local) state.roots["!ng." + propName + "._inject_" + inj] = field;
        }
      }
    }
    if (found) state.roots["!ng"] = modObj;
  }

  function postCondenseReach(state) {
    var mods = infer.cx().parent._angular.modules;
    for (var path in state.types) {
      var m;
      if (m = path.match(/^!ng\.([^\.]+)\._inject_([^\.]+)^/)) {
        var mod = mods[m[1].replace(/`/g, ".")];
        var field = mod.injector.fields[m[2]];
        var data = state.types[path];
        if (field.span) data.span = field.span;
        if (field.doc) data.doc = field.doc;
      }
    }
  }

  function initServer(server) {
    server._angular = {
      modules: Object.create(null),
      pendingImports: Object.create(null),
      nakedModules: []
    };
  }

  tern.registerPlugin("angular", function(server) {
    initServer(server);
    server.on("reset", function() { initServer(server); });
    return {defs: defs,
            passes: {postParse: postParse,
                     postLoadDef: postLoadDef,
                     preCondenseReach: preCondenseReach,
                     postCondenseReach: postCondenseReach},
            loadFirst: true};
  });

  var defs = {
    "!name": "angular",
    "!define": {
      cacheObj: {
        info: "fn() -> ?",
        put: "fn(key: string, value: ?) -> !1",
        get: "fn(key: string) -> ?",
        remove: "fn(key: string)",
        removeAll: "fn()",
        destroy: "fn()"
      },
      eventObj: {
        targetScope: "service.$rootScope",
        currentScope: "service.$rootScope",
        name: "string",
        stopPropagation: "fn()",
        preventDefault: "fn()",
        defaultPrevented: "bool"
      },
      directiveObj: {
        multiElement: {
          "!type": "bool",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-multielement-",
          "!doc": "When this property is set to true, the HTML compiler will collect DOM nodes between nodes with the attributes directive-name-start and directive-name-end, and group them together as the directive elements. It is recommended that this feature be used on directives which are not strictly behavioural (such as ngClick), and which do not manipulate or replace child nodes (such as ngInclude)."
        },
        priority: {
          "!type": "number",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-priority-",
          "!doc": "When there are multiple directives defined on a single DOM element, sometimes it is necessary to specify the order in which the directives are applied. The priority is used to sort the directives before their compile functions get called. Priority is defined as a number. Directives with greater numerical priority are compiled first. Pre-link functions are also run in priority order, but post-link functions are run in reverse order. The order of directives with the same priority is undefined. The default priority is 0."
        },
        terminal: {
          "!type": "bool",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-terminal-",
          "!doc": "If set to true then the current priority will be the last set of directives which will execute (any directives at the current priority will still execute as the order of execution on same priority is undefined). Note that expressions and other directives used in the directive's template will also be excluded from execution."
        },
        scope: {
          "!type": "?",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-scope-",
          "!doc": "If set to true, then a new scope will be created for this directive. If multiple directives on the same element request a new scope, only one new scope is created. The new scope rule does not apply for the root of the template since the root of the template always gets a new scope. If set to {} (object hash), then a new 'isolate' scope is created. The 'isolate' scope differs from normal scope in that it does not prototypically inherit from the parent scope. This is useful when creating reusable components, which should not accidentally read or modify data in the parent scope."
        },
        bindToController: {
          "!type": "bool",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-bindtocontroller-",
          "!doc": "When an isolate scope is used for a component (see above), and controllerAs is used, bindToController: true will allow a component to have its properties bound to the controller, rather than to scope. When the controller is instantiated, the initial values of the isolate scope bindings are already available."
        },
        controller: {
          "!type": "fn()",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-require-",
          "!doc": "Controller constructor function. The controller is instantiated before the pre-linking phase and it is shared with other directives (see require attribute). This allows the directives to communicate with each other and augment each other's behavior."
        },
        require: {
          "!type": "string",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-controller-",
          "!doc": "Require another directive and inject its controller as the fourth argument to the linking function. The require takes a string name (or array of strings) of the directive(s) to pass in. If an array is used, the injected argument will be an array in corresponding order. If no such directive can be found, or if the directive does not have a controller, then an error is raised."
        },
        controllerAs: {
          "!type": "string",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-controlleras-",
          "!doc": "Controller alias at the directive scope. An alias for the controller so it can be referenced at the directive template. The directive needs to define a scope for this configuration to be used. Useful in the case when directive is used as component."
        },
        restrict: {
          "!type": "string",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-restrict-",
          "!doc": "String of subset of EACM which restricts the directive to a specific directive declaration style. If omitted, the defaults (elements and attributes) are used. E - Element name (default): <my-directive></my-directive>. A - Attribute (default): <div my-directive='exp'></div>. C - Class: <div class='my-directive: exp;'></div>. M - Comment: <!-- directive: my-directive exp --> "
        },
        templateNamespace: {
          "!type": "string",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-templatenamespace-",
          "!doc": "String representing the document type used by the markup in the template. AngularJS needs this information as those elements need to be created and cloned in a special way when they are defined outside their usual containers like <svg> and <math>."
        },
        template: {
          "!type": "string",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-template-",
          "!doc": "HTML markup that may: Replace the contents of the directive's element (default). Replace the directive's element itself (if replace is true - DEPRECATED). Wrap the contents of the directive's element (if transclude is true)."
        },
        templateUrl: {
          "!type": "string",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-templateurl-",
          "!doc": "This is similar to template but the template is loaded from the specified URL, asynchronously."
        },
        transclude: {
          "!type": "bool",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-transclude-",
          "!doc": "Extract the contents of the element where the directive appears and make it available to the directive. The contents are compiled and provided to the directive as a transclusion function."
        },
        compile: {
          "!type": "fn(tElement: +Element, tAttrs: +Attr)",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-transclude-",
          "!doc": "The compile function deals with transforming the template DOM. Since most directives do not do template transformation, it is not used often."
        },
        link: {
          "!type": "fn(scope: ?, iElement: +Element, iAttrs: +Attr, controller: ?, transcludeFn: fn())",
          "!url": "https://docs.angularjs.org/api/ng/service/$compile#-link-",
          "!doc": "The link function is responsible for registering DOM listeners as well as updating the DOM. It is executed after the template has been cloned. This is where most of the directive logic will be put."
        }
      },
      Module: {
        "!url": "http://docs.angularjs.org/api/angular.Module",
        "!doc": "Interface for configuring angular modules.",
        prototype: {
          animation: {
            "!type": "fn(name: string, animationFactory: fn()) -> !this",
            "!url": "http://docs.angularjs.org/api/angular.Module#animation",
            "!doc": "Defines an animation hook that can be later used with $animate service and directives that use this service."
          },
          config: {
            "!type": "fn(configFn: fn()) -> !this",
            "!effects": ["custom angular_callInject 0"],
            "!url": "http://docs.angularjs.org/api/angular.Module#config",
            "!doc": "Use this method to register work which needs to be performed on module loading."
          },
          constant: "service.$provide.constant",
          controller: {
            "!type": "fn(name: string, constructor: fn()) -> !this",
            "!effects": ["custom angular_regFieldCall"],
            "!url": "http://docs.angularjs.org/api/ng.$controllerProvider",
            "!doc": "Register a controller."
          },
          directive: {
            "!type": "fn(name: string, directiveFactory: fn() -> directiveObj) -> !this",
            "!effects": ["custom angular_regFieldCall"],
            "!url": "http://docs.angularjs.org/api/ng.$compileProvider#directive",
            "!doc": "Register a new directive with the compiler."
          },
          factory: "service.$provide.factory",
          filter: {
            "!type": "fn(name: string, filterFactory: fn()) -> !this",
            "!effects": ["custom angular_callInject 1"],
            "!url": "http://docs.angularjs.org/api/ng.$filterProvider",
            "!doc": "Register filter factory function."
          },
          provider: "service.$provide.provider",
          run: {
            "!type": "fn(initializationFn: fn()) -> !this",
            "!effects": ["custom angular_callInject 0"],
            "!url": "http://docs.angularjs.org/api/angular.Module#run",
            "!doc": "Register work which should be performed when the injector is done loading all modules."
          },
          service: "service.$provide.service",
          value: "service.$provide.value",
          name: {
            "!type": "string",
            "!url": "http://docs.angularjs.org/api/angular.Module#name",
            "!doc": "Name of the module."
          },
          requires: {
            "!type": "[string]",
            "!url": "http://docs.angularjs.org/api/angular.Module#requires",
            "!doc": "List of module names which must be loaded before this module."
          }
        }
      },
      Promise: {
        "!url": "http://docs.angularjs.org/api/ng.$q",
        "!doc": "Allow for interested parties to get access to the result of the deferred task when it completes.",
        prototype: {
          then: "fn(successCallback: fn(value: ?), errorCallback: fn(reason: ?), notifyCallback: fn(value: ?)) -> +Promise",
          "catch": "fn(errorCallback: fn(reason: ?))",
          "finally": "fn(callback: fn()) -> +Promise",
          success: "fn(callback: fn(data: ?, status: number, headers: ?, config: ?)) -> +Promise",
          error: "fn(callback: fn(data: ?, status: number, headers: ?, config: ?)) -> +Promise"
        }
      },
      Deferred: {
        "!url": "http://docs.angularjs.org/api/ng.$q",
        prototype: {
          resolve: "fn(value: ?)",
          reject: "fn(reason: ?)",
          notify: "fn(value: ?)",
          promise: "+Promise"
        }
      },
      ResourceClass: {
        "!url": "http://docs.angularjs.org/api/ngResource.$resource",
        prototype: {
          $promise: "+Promise",
          $save: "fn()"
        }
      },
      Resource: {
        "!url": "http://docs.angularjs.org/api/ngResource.$resource",
        prototype: {
          get: "fn(params: ?, callback: fn()) -> +ResourceClass",
          save: "fn(params: ?, callback: fn()) -> +ResourceClass",
          query: "fn(params: ?, callback: fn()) -> +ResourceClass",
          remove: "fn(params: ?, callback: fn()) -> +ResourceClass",
          "delete": "fn(params: ?, callback: fn()) -> +ResourceClass"
        }
      },
      service: {
        $anchorScroll: {
          "!type": "fn()",
          "!url": "http://docs.angularjs.org/api/ng.$anchorScroll",
          "!doc": "Checks current value of $location.hash() and scroll to related element."
        },
        $animate: {
          "!url": "http://docs.angularjs.org/api/ng.$animate",
          "!doc": "Rudimentary DOM manipulation functions to insert, remove, move elements within the DOM.",
          addClass: {
            "!type": "fn(element: +Element, className: string, done?: fn()) -> !this",
            "!url": "http://docs.angularjs.org/api/ng.$animate#addClass",
            "!doc": "Adds the provided className CSS class value to the provided element."
          },
          enter: {
            "!type": "fn(element: +Element, parent: +Element, after: +Element, done?: fn()) -> !this",
            "!url": "http://docs.angularjs.org/api/ng.$animate#enter",
            "!doc": "Inserts the element into the DOM either after the after element or within the parent element."
          },
          leave: {
            "!type": "fn(element: +Element, done?: fn()) -> !this",
            "!url": "http://docs.angularjs.org/api/ng.$animate#leave",
            "!doc": "Removes the element from the DOM."
          },
          move: {
            "!type": "fn(element: +Element, parent: +Element, after: +Element, done?: fn()) -> !this",
            "!url": "http://docs.angularjs.org/api/ng.$animate#move",
            "!doc": "Moves element to be placed either after the after element or inside of the parent element."
          },
          removeClass: {
            "!type": "fn(element: +Element, className: string, done?: fn()) -> !this",
            "!url": "http://docs.angularjs.org/api/ng.$animate#removeClass",
            "!doc": "Removes the provided className CSS class value from the provided element."
          }
        },
        $cacheFactory: {
          "!type": "fn(cacheId: string, options?: ?) -> cacheObj",
          "!url": "http://docs.angularjs.org/api/ng.$cacheFactory",
          "!doc": "Factory that constructs cache objects and gives access to them."
        },
        $compile: {
          "!type": "fn(element: +Element, transclude: fn(scope: ?), maxPriority: number)",
          "!url": "http://docs.angularjs.org/api/ng.$compile",
          "!doc": "Compiles a piece of HTML string or DOM into a template and produces a template function."
        },
        $controller: {
          "!type": "fn(controller: fn(), locals: ?) -> ?",
          "!url": "http://docs.angularjs.org/api/ng.$controller",
          "!doc": "Instantiates controllers."
        },
        $document: {
          "!type": "jQuery.fn",
          "!url": "http://docs.angularjs.org/api/ng.$document",
          "!doc": "A jQuery (lite)-wrapped reference to the browser's window.document element."
        },
        $exceptionHandler: {
          "!type": "fn(exception: +Error, cause?: string)",
          "!url": "http://docs.angularjs.org/api/ng.$exceptionHandler",
          "!doc": "Any uncaught exception in angular expressions is delegated to this service."
        },
        $filter: {
          "!type": "fn(name: string) -> fn(input: string) -> string",
          "!url": "http://docs.angularjs.org/api/ng.$filter",
          "!doc": "Retrieve a filter function."
        },
        $http: {
          "!type": "fn(config: ?) -> service.$q",
          "!url": "http://docs.angularjs.org/api/ng.$http",
          "!doc": "Facilitates communication with remote HTTP servers.",
          "delete": "fn(url: string, config?: ?) -> +Promise",
          get: "fn(url: string, config?: ?) -> +Promise",
          head: "fn(url: string, config?: ?) -> +Promise",
          jsonp: "fn(url: string, config?: ?) -> +Promise",
          post: "fn(url: string, data: ?, config?: ?) -> +Promise",
          put: "fn(url: string, data: ?, config?: ?) -> +Promise"
        },
        $interpolate: {
          "!type": "fn(text: string, mustHaveExpression?: bool, trustedContext?: string) -> fn(context: ?) -> string",
          "!url": "http://docs.angularjs.org/api/ng.$interpolate",
          "!doc": "Compiles a string with markup into an interpolation function."
        },
        $locale: {
          "!url": "http://docs.angularjs.org/api/ng.$locale",
          id: "string"
        },
        $location: {
          "!url": "http://docs.angularjs.org/api/ng.$location",
          "!doc": "Parses the URL in the browser address bar.",
          absUrl: {
            "!type": "fn() -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#absUrl",
            "!doc": "Return full url representation."
          },
          hash: {
            "!type": "fn(value?: string) -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#hash",
            "!doc": "Get or set the hash fragment."
          },
          host: {
            "!type": "fn() -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#host",
            "!doc": "Return host of current url."
          },
          path: {
            "!type": "fn(value?: string) -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#path",
            "!doc": "Get or set the URL path."
          },
          port: {
            "!type": "fn() -> number",
            "!url": "http://docs.angularjs.org/api/ng.$location#port",
            "!doc": "Returns the port of the current url."
          },
          protocol: {
            "!type": "fn() -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#protocol",
            "!doc": "Return protocol of current url."
          },
          replace: {
            "!type": "fn()",
            "!url": "http://docs.angularjs.org/api/ng.$location#replace",
            "!doc": "Changes to $location during current $digest will be replacing current history record, instead of adding new one."
          },
          search: {
            "!type": "fn(search: string, paramValue?: string) -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#search",
            "!doc": "Get or set the URL query."
          },
          url: {
            "!type": "fn(url: string, replace?: string) -> string",
            "!url": "http://docs.angularjs.org/api/ng.$location#url",
            "!doc": "Get or set the current url."
          }
        },
        $log: {
          "!url": "http://docs.angularjs.org/api/ng.$log",
          "!doc": "Simple service for logging.",
          debug: {
            "!type": "fn(message: string)",
            "!url": "http://docs.angularjs.org/api/ng.$log#debug",
            "!doc": "Write a debug message."
          },
          error: {
            "!type": "fn(message: string)",
            "!url": "http://docs.angularjs.org/api/ng.$log#error",
            "!doc": "Write an error message."
          },
          info: {
            "!type": "fn(message: string)",
            "!url": "http://docs.angularjs.org/api/ng.$log#info",
            "!doc": "Write an info message."
          },
          log: {
            "!type": "fn(message: string)",
            "!url": "http://docs.angularjs.org/api/ng.$log#log",
            "!doc": "Write a log message."
          },
          warn: {
            "!type": "fn(message: string)",
            "!url": "http://docs.angularjs.org/api/ng.$log#warn",
            "!doc": "Write a warning message."
          }
        },
        $parse: {
          "!type": "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
          "!url": "http://docs.angularjs.org/api/ng.$parse",
          "!doc": "Converts Angular expression into a function."
        },
        $q: {
          "!url": "http://docs.angularjs.org/api/ng.$q",
          "!doc": "A promise/deferred implementation.",
          all: {
            "!type": "fn(promises: [+Promise]) -> +Promise",
            "!url": "http://docs.angularjs.org/api/ng.$q#all",
            "!doc": "Combines multiple promises into a single promise."
          },
          defer: {
            "!type": "fn() -> +Deferred",
            "!url": "http://docs.angularjs.org/api/ng.$q#defer",
            "!doc": "Creates a Deferred object which represents a task which will finish in the future."
          },
          reject: {
            "!type": "fn(reasion: ?) -> +Promise",
            "!url": "http://docs.angularjs.org/api/ng.$q#reject",
            "!doc": "Creates a promise that is resolved as rejected with the specified reason."
          },
          when: {
            "!type": "fn(value: ?) -> +Promise",
            "!url": "http://docs.angularjs.org/api/ng.$q#when",
            "!doc": "Wraps an object that might be a value or a (3rd party) then-able promise into a $q promise."
          }
        },
        $rootElement: {
          "!type": "+Element",
          "!url": "http://docs.angularjs.org/api/ng.$rootElement",
          "!doc": "The root element of Angular application."
        },
        $rootScope: {
          "!url": "http://docs.angularjs.org/api/ng.$rootScope",
          $apply: {
            "!type": "fn(expression: string)",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$apply",
            "!doc": "Execute an expression in angular from outside of the angular framework."
          },
          $broadcast: {
            "!type": "fn(name: string, args?: ?) -> eventObj",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$broadcast",
            "!doc": "Dispatches an event name downwards to all child scopes."
          },
          $destroy: {
            "!type": "fn()",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$destroy",
            "!doc": "Removes the current scope (and all of its children) from the parent scope."
          },
          $digest: {
            "!type": "fn()",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$digest",
            "!doc": "Processes all of the watchers of the current scope and its children."
          },
          $emit: {
            "!type": "fn(name: string, args?: ?) -> eventObj",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$emit",
            "!doc": "Dispatches an event name upwards through the scope hierarchy."
          },
          $eval: {
            "!type": "fn(expression: string) -> ?",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$eval",
            "!doc": "Executes the expression on the current scope and returns the result."
          },
          $evalAsync: {
            "!type": "fn(expression: string)",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$evalAsync",
            "!doc": "Executes the expression on the current scope at a later point in time."
          },
          $new: {
            "!type": "fn(isolate: bool) -> service.$rootScope",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$new",
            "!doc": "Creates a new child scope."
          },
          $on: {
            "!type": "fn(name: string, listener: fn(event: ?)) -> fn()",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$on",
            "!doc": "Listens on events of a given type."
          },
          $watch: {
            "!type": "fn(watchExpression: string, listener?: fn(), objectEquality?: bool) -> fn()",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$watch",
            "!doc": "Registers a listener callback to be executed whenever the watchExpression changes."
          },
          $watchCollection: {
            "!type": "fn(obj: string, listener: fn()) -> fn()",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$watchCollection",
            "!doc": "Shallow watches the properties of an object and fires whenever any of the properties."
          },
          $id: {
            "!type": "number",
            "!url": "http://docs.angularjs.org/api/ng.$rootScope.Scope#$id",
            "!doc": "Unique scope ID."
          }
        },
        $sce: {
          HTML: "string",
          CSS: "string",
          URL: "string",
          RESOURCE_URL: "string",
          JS: "string",
          getTrusted: "fn(type: string, maybeTrusted: ?) -> !1",
          getTrustedCss: "fn(maybeTrusted: ?) -> !0",
          getTrustedHtml: "fn(maybeTrusted: ?) -> !0",
          getTrustedJs: "fn(maybeTrusted: ?) -> !0",
          getTrustedResourceUrl: "fn(maybeTrusted: ?) -> !0",
          getTrustedUrl: "fn(maybeTrusted: ?) -> !0",
          parse: "fn(type: string, expression: string) -> fn(context: ?, locals: ?) -> ?",
          parseAsCss: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
          parseAsHtml: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
          parseAsJs: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
          parseAsResourceUrl: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
          parseAsUrl: "fn(expression: string) -> fn(context: ?, locals: ?) -> ?",
          trustAs: "fn(type: string, value: ?) -> !1",
          trustAsHtml: "fn(value: ?) -> !0",
          trustAsJs: "fn(value: ?) -> !0",
          trustAsResourceUrl: "fn(value: ?) -> !0",
          trustAsUrl: "fn(value: ?) -> !0",
          isEnabled: "fn() -> bool"
        },
        $templateCache: {
          "!url": "http://docs.angularjs.org/api/ng.$templateCache",
          "!proto": "cacheObj"
        },
        $timeout: {
          "!type": "fn(fn: fn(), delay?: number, invokeApply?: bool) -> +Promise",
          "!url": "http://docs.angularjs.org/api/ng.$timeout",
          "!doc": "Angular's wrapper for window.setTimeout.",
          cancel: "fn(promise: +Promise)"
        },
        $window: "<top>",
        $injector: {
          "!url": "http://docs.angularjs.org/api/AUTO.$injector",
          "!doc": "Retrieve object instances as defined by provider.",
          annotate: {
            "!type": "fn(f: fn()) -> [string]",
            "!url": "http://docs.angularjs.org/api/AUTO.$injector#annotate",
            "!doc": "Returns an array of service names which the function is requesting for injection."
          },
          get: {
            "!type": "fn(name: string) -> ?",
            "!url": "http://docs.angularjs.org/api/AUTO.$injector#get",
            "!doc": "Return an instance of a service."
          },
          has: {
            "!type": "fn(name: string) -> bool",
            "!url": "http://docs.angularjs.org/api/AUTO.$injector#has",
            "!doc": "Allows the user to query if the particular service exist."
          },
          instantiate: {
            "!type": "fn(type: fn(), locals?: ?) -> +!0",
            "!url": "http://docs.angularjs.org/api/AUTO.$injector#instantiate",
            "!doc": "Create a new instance of JS type."
          },
          invoke: {
            "!type": "fn(type: fn(), self?: ?, locals?: ?) -> !0.!ret",
            "!url": "http://docs.angularjs.org/api/AUTO.$injector#invoke",
            "!doc": "Invoke the method and supply the method arguments from the $injector."
          }
        },
        $provide: {
          "!url": "http://docs.angularjs.org/api/AUTO.$provide",
          "!doc": "Use $provide to register new providers with the $injector.",
          constant: {
            "!type": "fn(name: string, value: ?) -> !this",
            "!effects": ["custom angular_regField"],
            "!url": "http://docs.angularjs.org/api/AUTO.$provide#constant",
            "!doc": "A constant value."
          },
          decorator: {
            "!type": "fn(name: string, decorator: fn())",
            "!effects": ["custom angular_regFieldCall"],
            "!url": "http://docs.angularjs.org/api/AUTO.$provide#decorator",
            "!doc": "Decoration of service, allows the decorator to intercept the service instance creation."
          },
          factory: {
            "!type": "fn(name: string, providerFunction: fn()) -> !this",
            "!effects": ["custom angular_regFieldCall"],
            "!url": "http://docs.angularjs.org/api/AUTO.$provide#factory",
            "!doc": "A short hand for configuring services if only $get method is required."
          },
          provider: {
            "!type": "fn(name: string, providerType: fn()) -> !this",
            "!effects": ["custom angular_regFieldCall"],
            "!url": "http://docs.angularjs.org/api/AUTO.$provide#provider",
            "!doc": "Register a provider for a service."
          },
          service: {
            "!type": "fn(name: string, constructor: fn()) -> !this",
            "!effects": ["custom angular_regFieldNew"],
            "!url": "http://docs.angularjs.org/api/AUTO.$provide#provider",
            "!doc": "Register a provider for a service."
          },
          value: {
            "!type": "fn(name: string, object: ?) -> !this",
            "!effects": ["custom angular_regField"],
            "!url": "http://docs.angularjs.org/api/AUTO.$providevalue",
            "!doc": "A short hand for configuring services if the $get method is a constant."
          }
        },
        $cookies: {
          "!url": "http://docs.angularjs.org/api/ngCookies.$cookies",
          "!doc": "Provides read/write access to browser's cookies.",
          text: "string"
        },
        $resource: {
          "!type": "fn(url: string, paramDefaults?: ?, actions?: ?) -> +Resource",
          "!url": "http://docs.angularjs.org/api/ngResource.$resource",
          "!doc": "Creates a resource object that lets you interact with RESTful server-side data sources."
        },
        $route: {
          "!url": "http://docs.angularjs.org/api/ngRoute.$route",
          "!doc": "Deep-link URLs to controllers and views.",
          reload: {
            "!type": "fn()",
            "!url": "http://docs.angularjs.org/api/ngRoute.$route#reload",
            "!doc": "Reload the current route even if $location hasn't changed."
          },
          current: {
            "!url": "http://docs.angularjs.org/api/ngRoute.$route#current",
            "!doc": "Reference to the current route definition.",
            controller: "?",
            locals: "?"
          },
          routes: "[?]"
        },
        $sanitize: {
          "!type": "fn(string) -> string",
          "!url": "http://docs.angularjs.org/api/ngSanitize.$sanitize",
          "!doc": "Sanitize HTML input."
        },
        $swipe: {
          "!url": "http://docs.angularjs.org/api/ngTouch.$swipe",
          "!doc": "A service that abstracts the messier details of hold-and-drag swipe behavior.",
          bind: {
            "!type": "fn(element: +Element, handlers: ?)",
            "!url": "http://docs.angularjs.org/api/ngTouch.$swipe#bind",
            "!doc": "Abstracts the messier details of hold-and-drag swipe behavior."
          }
        }
      }
    },
    angular: {
      bind: {
        "!type": "fn(self: ?, fn: fn(), args?: ?) -> !custom:angular_bind",
        "!url": "http://docs.angularjs.org/api/angular.bind",
        "!doc": "Returns a function which calls function fn bound to self."
      },
      bootstrap: {
        "!type": "fn(element: +Element, modules?: [string]) -> service.$injector",
        "!url": "http://docs.angularjs.org/api/angular.bootstrap",
        "!doc": "Use this function to manually start up angular application."
      },
      copy: {
        "!type": "fn(source: ?, target?: ?) -> !0",
        "!url": "http://docs.angularjs.org/api/angular.copy",
        "!doc": "Creates a deep copy of source, which should be an object or an array."
      },
      element: {
        "!type": "fn(element: +Element) -> jQuery.fn",
        "!url": "http://docs.angularjs.org/api/angular.element",
        "!doc": "Wraps a raw DOM element or HTML string as a jQuery element."
      },
      equals: {
        "!type": "fn(o1: ?, o2: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.equals",
        "!doc": "Determines if two objects or two values are equivalent."
      },
      extend: {
        "!type": "fn(dst: ?, src: ?) -> !0",
        "!url": "http://docs.angularjs.org/api/angular.extend",
        "!doc": "Extends the destination object dst by copying all of the properties from the src object(s) to dst."
      },
      forEach: {
        "!type": "fn(obj: ?, iterator: fn(value: ?, key: ?), context?: ?) -> !0",
        "!effects": ["call !1 this=!2 !0.<i> number"],
        "!url": "http://docs.angularjs.org/api/angular.forEach",
        "!doc": "Invokes the iterator function once for each item in obj collection, which can be either an object or an array."
      },
      fromJson: {
        "!type": "fn(json: string) -> ?",
        "!url": "http://docs.angularjs.org/api/angular.fromJson",
        "!doc": "Deserializes a JSON string."
      },
      identity: {
        "!type": "fn(val: ?) -> !0",
        "!url": "http://docs.angularjs.org/api/angular.identity",
        "!doc": "A function that returns its first argument."
      },
      injector: {
        "!type": "fn(modules: [string]) -> service.$injector",
        "!url": "http://docs.angularjs.org/api/angular.injector",
        "!doc": "Creates an injector function"
      },
      isArray: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isArray",
        "!doc": "Determines if a reference is an Array."
      },
      isDate: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isDate",
        "!doc": "Determines if a reference is a date."
      },
      isDefined: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isDefined",
        "!doc": "Determines if a reference is defined."
      },
      isElement: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isElement",
        "!doc": "Determines if a reference is a DOM element."
      },
      isFunction: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isFunction",
        "!doc": "Determines if a reference is a function."
      },
      isNumber: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isNumber",
        "!doc": "Determines if a reference is a number."
      },
      isObject: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isObject",
        "!doc": "Determines if a reference is an object."
      },
      isString: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isString",
        "!doc": "Determines if a reference is a string."
      },
      isUndefined: {
        "!type": "fn(val: ?) -> bool",
        "!url": "http://docs.angularjs.org/api/angular.isUndefined",
        "!doc": "Determines if a reference is undefined."
      },
      lowercase: {
        "!type": "fn(val: string) -> string",
        "!url": "http://docs.angularjs.org/api/angular.lowercase",
        "!doc": "Converts the specified string to lowercase."
      },
      module: {
        "!type": "fn(name: string, deps: [string]) -> !custom:angular_module",
        "!url": "http://docs.angularjs.org/api/angular.module",
        "!doc": "A global place for creating, registering and retrieving Angular modules."
      },
      Module: "Module",
      noop: {
        "!type": "fn()",
        "!url": "http://docs.angularjs.org/api/angular.noop",
        "!doc": "A function that performs no operations."
      },
      toJson: {
        "!type": "fn(val: ?) -> string",
        "!url": "http://docs.angularjs.org/api/angular.toJson",
        "!doc": "Serializes input into a JSON-formatted string."
      },
      uppercase: {
        "!type": "fn(string) -> string",
        "!url": "http://docs.angularjs.org/api/angular.uppercase",
        "!doc": "Converts the specified string to uppercase."
      },
      version: {
        "!url": "http://docs.angularjs.org/api/angular.version",
        full: "string",
        major: "number",
        minor: "number",
        dot: "number",
        codename: "string"
      }
    }
  };
});

//#endregion


//#region tern/defs/browser.json

var def_browser = {
  "!name": "browser",
  "location": {
    "assign": {
      "!type": "fn(url: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "Load the document at the provided URL."
    },
    "replace": {
      "!type": "fn(url: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "Replace the current document with the one at the provided URL. The difference from the assign() method is that after using replace() the current page will not be saved in session history, meaning the user won't be able to use the Back button to navigate to it."
    },
    "reload": {
      "!type": "fn()",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "Reload the document from the current URL. forceget is a boolean, which, when it is true, causes the page to always be reloaded from the server. If it is false or not specified, the browser may reload the page from its cache."
    },
    "origin": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The origin of the URL."
    },
    "hash": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The part of the URL that follows the # symbol, including the # symbol."
    },
    "search": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The part of the URL that follows the ? symbol, including the ? symbol."
    },
    "pathname": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The path (relative to the host)."
    },
    "port": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The port number of the URL."
    },
    "hostname": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The host name (without the port number or square brackets)."
    },
    "host": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The host name and port number."
    },
    "protocol": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The protocol of the URL."
    },
    "href": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
      "!doc": "The entire URL."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.location",
    "!doc": "Returns a location object with information about the current location of the document. Assigning to the location property changes the current page to the new address."
  },
  "Node": {
    "!type": "fn()",
    "prototype": {
      "parentElement": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.parentElement",
        "!doc": "Returns the DOM node's parent Element, or null if the node either has no parent, or its parent isn't a DOM Element."
      },
      "textContent": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.textContent",
        "!doc": "Gets or sets the text content of a node and its descendants."
      },
      "baseURI": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.baseURI",
        "!doc": "The absolute base URI of a node or null if unable to obtain an absolute URI."
      },
      "localName": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.localName",
        "!doc": "Returns the local part of the qualified name of this node."
      },
      "prefix": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.prefix",
        "!doc": "Returns the namespace prefix of the specified node, or null if no prefix is specified. This property is read only."
      },
      "namespaceURI": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.namespaceURI",
        "!doc": "The namespace URI of the node, or null if the node is not in a namespace (read-only). When the node is a document, it returns the XML namespace for the current document."
      },
      "ownerDocument": {
        "!type": "+Document",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.ownerDocument",
        "!doc": "The ownerDocument property returns the top-level document object for this node."
      },
      "attributes": {
        "!type": "+NamedNodeMap",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.attributes",
        "!doc": "A collection of all attribute nodes registered to the specified node. It is a NamedNodeMap,not an Array, so it has no Array methods and the Attr nodes' indexes may differ among browsers."
      },
      "nextSibling": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nextSibling",
        "!doc": "Returns the node immediately following the specified one in its parent's childNodes list, or null if the specified node is the last node in that list."
      },
      "previousSibling": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.previousSibling",
        "!doc": "Returns the node immediately preceding the specified one in its parent's childNodes list, null if the specified node is the first in that list."
      },
      "lastChild": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.lastChild",
        "!doc": "Returns the last child of a node."
      },
      "firstChild": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.firstChild",
        "!doc": "Returns the node's first child in the tree, or null if the node is childless. If the node is a Document, it returns the first node in the list of its direct children."
      },
      "childNodes": {
        "!type": "+NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.childNodes",
        "!doc": "Returns a collection of child nodes of the given element."
      },
      "parentNode": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.parentNode",
        "!doc": "Returns the parent of the specified node in the DOM tree."
      },
      "nodeType": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeType",
        "!doc": "Returns an integer code representing the type of the node."
      },
      "nodeValue": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeValue",
        "!doc": "Returns or sets the value of the current node."
      },
      "nodeName": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeName",
        "!doc": "Returns the name of the current node as a string."
      },
      "tagName": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.nodeName",
        "!doc": "Returns the name of the current node as a string."
      },
      "insertBefore": {
        "!type": "fn(newElt: +Element, before: +Element) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.insertBefore",
        "!doc": "Inserts the specified node before a reference element as a child of the current node."
      },
      "replaceChild": {
        "!type": "fn(newElt: +Element, oldElt: +Element) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.replaceChild",
        "!doc": "Replaces one child node of the specified element with another."
      },
      "removeChild": {
        "!type": "fn(oldElt: +Element) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.removeChild",
        "!doc": "Removes a child node from the DOM. Returns removed node."
      },
      "appendChild": {
        "!type": "fn(newElt: +Element) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.appendChild",
        "!doc": "Adds a node to the end of the list of children of a specified parent node. If the node already exists it is removed from current parent node, then added to new parent node."
      },
      "hasChildNodes": {
        "!type": "fn() -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.hasChildNodes",
        "!doc": "Returns a Boolean value indicating whether the current Node has child nodes or not."
      },
      "cloneNode": {
        "!type": "fn(deep: bool) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.cloneNode",
        "!doc": "Returns a duplicate of the node on which this method was called."
      },
      "normalize": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.normalize",
        "!doc": "Puts the specified node and all of its subtree into a \"normalized\" form. In a normalized subtree, no text nodes in the subtree are empty and there are no adjacent text nodes."
      },
      "isSupported": {
        "!type": "fn(features: string, version: number) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isSupported",
        "!doc": "Tests whether the DOM implementation implements a specific feature and that feature is supported by this node."
      },
      "hasAttributes": {
        "!type": "fn() -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.hasAttributes",
        "!doc": "Returns a boolean value of true or false, indicating if the current element has any attributes or not."
      },
      "lookupPrefix": {
        "!type": "fn(uri: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.lookupPrefix",
        "!doc": "Returns the prefix for a given namespaceURI if present, and null if not. When multiple prefixes are possible, the result is implementation-dependent."
      },
      "isDefaultNamespace": {
        "!type": "fn(uri: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isDefaultNamespace",
        "!doc": "Accepts a namespace URI as an argument and returns true if the namespace is the default namespace on the given node or false if not."
      },
      "lookupNamespaceURI": {
        "!type": "fn(uri: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.lookupNamespaceURI",
        "!doc": "Takes a prefix and returns the namespaceURI associated with it on the given node if found (and null if not). Supplying null for the prefix will return the default namespace."
      },
      "addEventListener": {
        "!type": "fn(type: string, listener: fn(e: +Event), capture: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.addEventListener",
        "!doc": "Registers a single event listener on a single target. The event target may be a single element in a document, the document itself, a window, or an XMLHttpRequest."
      },
      "removeEventListener": {
        "!type": "fn(type: string, listener: fn(), capture: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.removeEventListener",
        "!doc": "Allows the removal of event listeners from the event target."
      },
      "isSameNode": {
        "!type": "fn(other: +Node) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isSameNode",
        "!doc": "Tests whether two nodes are the same, that is they reference the same object."
      },
      "isEqualNode": {
        "!type": "fn(other: +Node) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.isEqualNode",
        "!doc": "Tests whether two nodes are equal."
      },
      "compareDocumentPosition": {
        "!type": "fn(other: +Node) -> number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.compareDocumentPosition",
        "!doc": "Compares the position of the current node against another node in any other document."
      },
      "contains": {
        "!type": "fn(other: +Node) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Node.contains",
        "!doc": "Indicates whether a node is a descendent of a given node."
      },
      "dispatchEvent": {
        "!type": "fn(event: +Event) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.dispatchEvent",
        "!doc": "Dispatches an event into the event system. The event is subject to the same capturing and bubbling behavior as directly dispatched events."
      },
      "ELEMENT_NODE": "number",
      "ATTRIBUTE_NODE": "number",
      "TEXT_NODE": "number",
      "CDATA_SECTION_NODE": "number",
      "ENTITY_REFERENCE_NODE": "number",
      "ENTITY_NODE": "number",
      "PROCESSING_INSTRUCTION_NODE": "number",
      "COMMENT_NODE": "number",
      "DOCUMENT_NODE": "number",
      "DOCUMENT_TYPE_NODE": "number",
      "DOCUMENT_FRAGMENT_NODE": "number",
      "NOTATION_NODE": "number",
      "DOCUMENT_POSITION_DISCONNECTED": "number",
      "DOCUMENT_POSITION_PRECEDING": "number",
      "DOCUMENT_POSITION_FOLLOWING": "number",
      "DOCUMENT_POSITION_CONTAINS": "number",
      "DOCUMENT_POSITION_CONTAINED_BY": "number",
      "DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC": "number"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Node",
    "!doc": "A Node is an interface from which a number of DOM types inherit, and allows these various types to be treated (or tested) similarly."
  },
  "Element": {
    "!type": "fn()",
    "prototype": {
      "!proto": "Node.prototype",
      "getAttribute": {
        "!type": "fn(name: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttribute",
        "!doc": "Returns the value of the named attribute on the specified element. If the named attribute does not exist, the value returned will either be null or \"\" (the empty string)."
      },
      "setAttribute": {
        "!type": "fn(name: string, value: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttribute",
        "!doc": "Adds a new attribute or changes the value of an existing attribute on the specified element."
      },
      "removeAttribute": {
        "!type": "fn(name: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.removeAttribute",
        "!doc": "Removes an attribute from the specified element."
      },
      "getAttributeNode": {
        "!type": "fn(name: string) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttributeNode",
        "!doc": "Returns the specified attribute of the specified element, as an Attr node."
      },
      "getElementsByTagName": {
        "!type": "fn(tagName: string) -> +NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getElementsByTagName",
        "!doc": "Returns a list of elements with the given tag name. The subtree underneath the specified element is searched, excluding the element itself. The returned list is live, meaning that it updates itself with the DOM tree automatically. Consequently, there is no need to call several times element.getElementsByTagName with the same element and arguments."
      },
      "getElementsByTagNameNS": {
        "!type": "fn(ns: string, tagName: string) -> +NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getElementsByTagNameNS",
        "!doc": "Returns a list of elements with the given tag name belonging to the given namespace."
      },
      "getAttributeNS": {
        "!type": "fn(ns: string, name: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttributeNS",
        "!doc": "Returns the string value of the attribute with the specified namespace and name. If the named attribute does not exist, the value returned will either be null or \"\" (the empty string)."
      },
      "setAttributeNS": {
        "!type": "fn(ns: string, name: string, value: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttributeNS",
        "!doc": "Adds a new attribute or changes the value of an attribute with the given namespace and name."
      },
      "removeAttributeNS": {
        "!type": "fn(ns: string, name: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.removeAttributeNS",
        "!doc": "removeAttributeNS removes the specified attribute from an element."
      },
      "getAttributeNodeNS": {
        "!type": "fn(ns: string, name: string) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getAttributeNodeNS",
        "!doc": "Returns the Attr node for the attribute with the given namespace and name."
      },
      "hasAttribute": {
        "!type": "fn(name: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.hasAttribute",
        "!doc": "hasAttribute returns a boolean value indicating whether the specified element has the specified attribute or not."
      },
      "hasAttributeNS": {
        "!type": "fn(ns: string, name: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.hasAttributeNS",
        "!doc": "hasAttributeNS returns a boolean value indicating whether the current element has the specified attribute."
      },
      "focus": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.focus",
        "!doc": "Sets focus on the specified element, if it can be focused."
      },
      "blur": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.blur",
        "!doc": "The blur method removes keyboard focus from the current element."
      },
      "scrollIntoView": {
        "!type": "fn(top: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollIntoView",
        "!doc": "The scrollIntoView() method scrolls the element into view."
      },
      "scrollByLines": {
        "!type": "fn(lines: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollByLines",
        "!doc": "Scrolls the document by the given number of lines."
      },
      "scrollByPages": {
        "!type": "fn(pages: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollByPages",
        "!doc": "Scrolls the current document by the specified number of pages."
      },
      "getElementsByClassName": {
        "!type": "fn(name: string) -> +NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByClassName",
        "!doc": "Returns a set of elements which have all the given class names. When called on the document object, the complete document is searched, including the root node. You may also call getElementsByClassName on any element; it will return only elements which are descendants of the specified root element with the given class names."
      },
      "querySelector": {
        "!type": "fn(selectors: string) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.querySelector",
        "!doc": "Returns the first element that is a descendent of the element on which it is invoked that matches the specified group of selectors."
      },
      "querySelectorAll": {
        "!type": "fn(selectors: string) -> +NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.querySelectorAll",
        "!doc": "Returns a non-live NodeList of all elements descended from the element on which it is invoked that match the specified group of CSS selectors."
      },
      "getClientRects": {
        "!type": "fn() -> [+ClientRect]",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
        "!doc": "Returns a collection of rectangles that indicate the bounding rectangles for each box in a client."
      },
      "getBoundingClientRect": {
        "!type": "fn() -> +ClientRect",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getBoundingClientRect",
        "!doc": "Returns a text rectangle object that encloses a group of text rectangles."
      },
      "setAttributeNode": {
        "!type": "fn(attr: +Attr) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttributeNode",
        "!doc": "Adds a new Attr node to the specified element."
      },
      "removeAttributeNode": {
        "!type": "fn(attr: +Attr) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.removeAttributeNode",
        "!doc": "Removes the specified attribute from the current element."
      },
      "setAttributeNodeNS": {
        "!type": "fn(attr: +Attr) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.setAttributeNodeNS",
        "!doc": "Adds a new namespaced attribute node to an element."
      },
      "insertAdjacentHTML": {
        "!type": "fn(position: string, text: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.insertAdjacentHTML",
        "!doc": "Parses the specified text as HTML or XML and inserts the resulting nodes into the DOM tree at a specified position. It does not reparse the element it is being used on and thus it does not corrupt the existing elements inside the element. This, and avoiding the extra step of serialization make it much faster than direct innerHTML manipulation."
      },
      "children": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.children",
        "!doc": "Returns a collection of child elements of the given element."
      },
      "childElementCount": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.childElementCount",
        "!doc": "Returns the number of child elements of the given element."
      },
      "className": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.className",
        "!doc": "Gets and sets the value of the class attribute of the specified element."
      },
      "style": {
        "cssText": "string",
        "alignmentBaseline": "string",
        "background": "string",
        "backgroundAttachment": "string",
        "backgroundClip": "string",
        "backgroundColor": "string",
        "backgroundImage": "string",
        "backgroundOrigin": "string",
        "backgroundPosition": "string",
        "backgroundPositionX": "string",
        "backgroundPositionY": "string",
        "backgroundRepeat": "string",
        "backgroundRepeatX": "string",
        "backgroundRepeatY": "string",
        "backgroundSize": "string",
        "baselineShift": "string",
        "border": "string",
        "borderBottom": "string",
        "borderBottomColor": "string",
        "borderBottomLeftRadius": "string",
        "borderBottomRightRadius": "string",
        "borderBottomStyle": "string",
        "borderBottomWidth": "string",
        "borderCollapse": "string",
        "borderColor": "string",
        "borderImage": "string",
        "borderImageOutset": "string",
        "borderImageRepeat": "string",
        "borderImageSlice": "string",
        "borderImageSource": "string",
        "borderImageWidth": "string",
        "borderLeft": "string",
        "borderLeftColor": "string",
        "borderLeftStyle": "string",
        "borderLeftWidth": "string",
        "borderRadius": "string",
        "borderRight": "string",
        "borderRightColor": "string",
        "borderRightStyle": "string",
        "borderRightWidth": "string",
        "borderSpacing": "string",
        "borderStyle": "string",
        "borderTop": "string",
        "borderTopColor": "string",
        "borderTopLeftRadius": "string",
        "borderTopRightRadius": "string",
        "borderTopStyle": "string",
        "borderTopWidth": "string",
        "borderWidth": "string",
        "bottom": "string",
        "boxShadow": "string",
        "boxSizing": "string",
        "captionSide": "string",
        "clear": "string",
        "clip": "string",
        "clipPath": "string",
        "clipRule": "string",
        "color": "string",
        "colorInterpolation": "string",
        "colorInterpolationFilters": "string",
        "colorProfile": "string",
        "colorRendering": "string",
        "content": "string",
        "counterIncrement": "string",
        "counterReset": "string",
        "cursor": "string",
        "direction": "string",
        "display": "string",
        "dominantBaseline": "string",
        "emptyCells": "string",
        "enableBackground": "string",
        "fill": "string",
        "fillOpacity": "string",
        "fillRule": "string",
        "filter": "string",
        "float": "string",
        "floodColor": "string",
        "floodOpacity": "string",
        "font": "string",
        "fontFamily": "string",
        "fontSize": "string",
        "fontStretch": "string",
        "fontStyle": "string",
        "fontVariant": "string",
        "fontWeight": "string",
        "glyphOrientationHorizontal": "string",
        "glyphOrientationVertical": "string",
        "height": "string",
        "imageRendering": "string",
        "kerning": "string",
        "left": "string",
        "letterSpacing": "string",
        "lightingColor": "string",
        "lineHeight": "string",
        "listStyle": "string",
        "listStyleImage": "string",
        "listStylePosition": "string",
        "listStyleType": "string",
        "margin": "string",
        "marginBottom": "string",
        "marginLeft": "string",
        "marginRight": "string",
        "marginTop": "string",
        "marker": "string",
        "markerEnd": "string",
        "markerMid": "string",
        "markerStart": "string",
        "mask": "string",
        "maxHeight": "string",
        "maxWidth": "string",
        "minHeight": "string",
        "minWidth": "string",
        "opacity": "string",
        "orphans": "string",
        "outline": "string",
        "outlineColor": "string",
        "outlineOffset": "string",
        "outlineStyle": "string",
        "outlineWidth": "string",
        "overflow": "string",
        "overflowWrap": "string",
        "overflowX": "string",
        "overflowY": "string",
        "padding": "string",
        "paddingBottom": "string",
        "paddingLeft": "string",
        "paddingRight": "string",
        "paddingTop": "string",
        "page": "string",
        "pageBreakAfter": "string",
        "pageBreakBefore": "string",
        "pageBreakInside": "string",
        "pointerEvents": "string",
        "position": "string",
        "quotes": "string",
        "resize": "string",
        "right": "string",
        "shapeRendering": "string",
        "size": "string",
        "speak": "string",
        "src": "string",
        "stopColor": "string",
        "stopOpacity": "string",
        "stroke": "string",
        "strokeDasharray": "string",
        "strokeDashoffset": "string",
        "strokeLinecap": "string",
        "strokeLinejoin": "string",
        "strokeMiterlimit": "string",
        "strokeOpacity": "string",
        "strokeWidth": "string",
        "tabSize": "string",
        "tableLayout": "string",
        "textAlign": "string",
        "textAnchor": "string",
        "textDecoration": "string",
        "textIndent": "string",
        "textLineThrough": "string",
        "textLineThroughColor": "string",
        "textLineThroughMode": "string",
        "textLineThroughStyle": "string",
        "textLineThroughWidth": "string",
        "textOverflow": "string",
        "textOverline": "string",
        "textOverlineColor": "string",
        "textOverlineMode": "string",
        "textOverlineStyle": "string",
        "textOverlineWidth": "string",
        "textRendering": "string",
        "textShadow": "string",
        "textTransform": "string",
        "textUnderline": "string",
        "textUnderlineColor": "string",
        "textUnderlineMode": "string",
        "textUnderlineStyle": "string",
        "textUnderlineWidth": "string",
        "top": "string",
        "unicodeBidi": "string",
        "unicodeRange": "string",
        "vectorEffect": "string",
        "verticalAlign": "string",
        "visibility": "string",
        "whiteSpace": "string",
        "width": "string",
        "wordBreak": "string",
        "wordSpacing": "string",
        "wordWrap": "string",
        "writingMode": "string",
        "zIndex": "string",
        "zoom": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.style",
        "!doc": "Returns an object that represents the element's style attribute."
      },
      "classList": {
        "!type": "+DOMTokenList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.classList",
        "!doc": "Returns a token list of the class attribute of the element."
      },
      "contentEditable": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.contentEditable",
        "!doc": "Indicates whether or not the element is editable."
      },
      "firstElementChild": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.firstElementChild",
        "!doc": "Returns the element's first child element or null if there are no child elements."
      },
      "lastElementChild": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.lastElementChild",
        "!doc": "Returns the element's last child element or null if there are no child elements."
      },
      "nextElementSibling": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.nextElementSibling",
        "!doc": "Returns the element immediately following the specified one in its parent's children list, or null if the specified element is the last one in the list."
      },
      "previousElementSibling": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Element.previousElementSibling",
        "!doc": "Returns the element immediately prior to the specified one in its parent's children list, or null if the specified element is the first one in the list."
      },
      "tabIndex": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.tabIndex",
        "!doc": "Gets/sets the tab order of the current element."
      },
      "title": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.title",
        "!doc": "Establishes the text to be displayed in a 'tool tip' popup when the mouse is over the displayed node."
      },
      "width": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetWidth",
        "!doc": "Returns the layout width of an element."
      },
      "height": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetHeight",
        "!doc": "Height of an element relative to the element's offsetParent."
      },
      "getContext": {
        "!type": "fn(id: string) -> CanvasRenderingContext2D",
        "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCanvasElement",
        "!doc": "DOM canvas elements expose the HTMLCanvasElement interface, which provides properties and methods for manipulating the layout and presentation of canvas elements. The HTMLCanvasElement interface inherits the properties and methods of the element object interface."
      },
      "supportsContext": "fn(id: string) -> bool",
      "oncopy": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.oncopy",
        "!doc": "The oncopy property returns the onCopy event handler code on the current element."
      },
      "oncut": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.oncut",
        "!doc": "The oncut property returns the onCut event handler code on the current element."
      },
      "onpaste": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onpaste",
        "!doc": "The onpaste property returns the onPaste event handler code on the current element."
      },
      "onbeforeunload": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/HTML/Element/body",
        "!doc": "The HTML <body> element represents the main content of an HTML document. There is only one <body> element in a document."
      },
      "onfocus": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onfocus",
        "!doc": "The onfocus property returns the onFocus event handler code on the current element."
      },
      "onblur": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onblur",
        "!doc": "The onblur property returns the onBlur event handler code, if any, that exists on the current element."
      },
      "onchange": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onchange",
        "!doc": "The onchange property sets and returns the onChange event handler code for the current element."
      },
      "onclick": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onclick",
        "!doc": "The onclick property returns the onClick event handler code on the current element."
      },
      "ondblclick": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.ondblclick",
        "!doc": "The ondblclick property returns the onDblClick event handler code on the current element."
      },
      "onmousedown": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmousedown",
        "!doc": "The onmousedown property returns the onMouseDown event handler code on the current element."
      },
      "onmouseup": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseup",
        "!doc": "The onmouseup property returns the onMouseUp event handler code on the current element."
      },
      "onmousewheel": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/wheel",
        "!doc": "The wheel event is fired when a wheel button of a pointing device (usually a mouse) is rotated. This event deprecates the legacy mousewheel event."
      },
      "onmouseover": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseover",
        "!doc": "The onmouseover property returns the onMouseOver event handler code on the current element."
      },
      "onmouseout": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseout",
        "!doc": "The onmouseout property returns the onMouseOut event handler code on the current element."
      },
      "onmousemove": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmousemove",
        "!doc": "The onmousemove property returns the mousemove event handler code on the current element."
      },
      "oncontextmenu": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.oncontextmenu",
        "!doc": "An event handler property for right-click events on the window. Unless the default behavior is prevented, the browser context menu will activate. Note that this event will occur with any non-disabled right-click event and does not depend on an element possessing the \"contextmenu\" attribute."
      },
      "onkeydown": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeydown",
        "!doc": "The onkeydown property returns the onKeyDown event handler code on the current element."
      },
      "onkeyup": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeyup",
        "!doc": "The onkeyup property returns the onKeyUp event handler code for the current element."
      },
      "onkeypress": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeypress",
        "!doc": "The onkeypress property sets and returns the onKeyPress event handler code for the current element."
      },
      "onresize": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onresize",
        "!doc": "onresize returns the element's onresize event handler code. It can also be used to set the code to be executed when the resize event occurs."
      },
      "onscroll": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.onscroll",
        "!doc": "The onscroll property returns the onScroll event handler code on the current element."
      },
      "ondragstart": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
        "!doc": "The following describes the steps that occur during a drag and drop operation."
      },
      "ondragover": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragover",
        "!doc": "The dragover event is fired when an element or text selection is being dragged over a valid drop target (every few hundred milliseconds)."
      },
      "ondragleave": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragleave",
        "!doc": "The dragleave event is fired when a dragged element or text selection leaves a valid drop target."
      },
      "ondragenter": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragenter",
        "!doc": "The dragenter event is fired when a dragged element or text selection enters a valid drop target."
      },
      "ondragend": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/dragend",
        "!doc": "The dragend event is fired when a drag operation is being ended (by releasing a mouse button or hitting the escape key)."
      },
      "ondrag": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Mozilla_event_reference/drag",
        "!doc": "The drag event is fired when an element or text selection is being dragged (every few hundred milliseconds)."
      },
      "offsetTop": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetTop",
        "!doc": "Returns the distance of the current element relative to the top of the offsetParent node."
      },
      "offsetLeft": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetLeft",
        "!doc": "Returns the number of pixels that the upper left corner of the current element is offset to the left within the offsetParent node."
      },
      "offsetHeight": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetHeight",
        "!doc": "Height of an element relative to the element's offsetParent."
      },
      "offsetWidth": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.offsetWidth",
        "!doc": "Returns the layout width of an element."
      },
      "scrollTop": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollTop",
        "!doc": "Gets or sets the number of pixels that the content of an element is scrolled upward."
      },
      "scrollLeft": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollLeft",
        "!doc": "Gets or sets the number of pixels that an element's content is scrolled to the left."
      },
      "scrollHeight": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollHeight",
        "!doc": "Height of the scroll view of an element; it includes the element padding but not its margin."
      },
      "scrollWidth": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.scrollWidth",
        "!doc": "Read-only property that returns either the width in pixels of the content of an element or the width of the element itself, whichever is greater."
      },
      "clientTop": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientTop",
        "!doc": "The width of the top border of an element in pixels. It does not include the top margin or padding. clientTop is read-only."
      },
      "clientLeft": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientLeft",
        "!doc": "The width of the left border of an element in pixels. It includes the width of the vertical scrollbar if the text direction of the element is right-to-left and if there is an overflow causing a left vertical scrollbar to be rendered. clientLeft does not include the left margin or the left padding. clientLeft is read-only."
      },
      "clientHeight": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientHeight",
        "!doc": "Returns the inner height of an element in pixels, including padding but not the horizontal scrollbar height, border, or margin."
      },
      "clientWidth": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.clientWidth",
        "!doc": "The inner width of an element in pixels. It includes padding but not the vertical scrollbar (if present, if rendered), border or margin."
      },
      "innerHTML": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.innerHTML",
        "!doc": "Sets or gets the HTML syntax describing the element's descendants."
      },
      "createdCallback": {
        "!type": "fn()",
        "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-created-callback",
        "!doc": "This callback is invoked after custom element instance is created and its definition is registered. The actual timing of this callback is defined further in this specification."
      },
      "attachedCallback": {
        "!type": "fn()",
        "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-entered-view-callback",
        "!doc": "Unless specified otherwise, this callback must be enqueued whenever custom element is inserted into a document and this document has a browsing context."
      },
      "detachedCallback": {
        "!type": "fn()",
        "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-left-view-callback",
        "!doc": "Unless specified otherwise, this callback must be enqueued whenever custom element is removed from the document and this document has a browsing context."
      },
      "attributeChangedCallback": {
        "!type": "fn()",
        "!url": "http://w3c.github.io/webcomponents/spec/custom/index.html#dfn-attribute-changed-callback",
        "!doc": "Unless specified otherwise, this callback must be enqueued whenever custom element's attribute is added, changed or removed."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Element",
    "!doc": "Represents an element in an HTML or XML document."
  },
  "Text": {
    "!type": "fn()",
    "prototype": {
      "!proto": "Node.prototype",
      "wholeText": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Text.wholeText",
        "!doc": "Returns all text of all Text nodes logically adjacent to the node.  The text is concatenated in document order.  This allows you to specify any text node and obtain all adjacent text as a single string."
      },
      "splitText": {
        "!type": "fn(offset: number) -> +Text",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Text.splitText",
        "!doc": "Breaks the Text node into two nodes at the specified offset, keeping both nodes in the tree as siblings."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Text",
    "!doc": "In the DOM, the Text interface represents the textual content of an Element or Attr.  If an element has no markup within its content, it has a single child implementing Text that contains the element's text.  However, if the element contains markup, it is parsed into information items and Text nodes that form its children."
  },
  "Document": {
    "!type": "fn()",
    "prototype": {
      "!proto": "Node.prototype",
      "activeElement": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.activeElement",
        "!doc": "Returns the currently focused element, that is, the element that will get keystroke events if the user types any. This attribute is read only."
      },
      "compatMode": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.compatMode",
        "!doc": "Indicates whether the document is rendered in Quirks mode or Strict mode."
      },
      "designMode": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.designMode",
        "!doc": "Can be used to make any document editable, for example in a <iframe />:"
      },
      "dir": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Document.dir",
        "!doc": "This property should indicate and allow the setting of the directionality of the text of the document, whether left to right (default) or right to left."
      },
      "height": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.height",
        "!doc": "Returns the height of the <body> element of the current document."
      },
      "width": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.width",
        "!doc": "Returns the width of the <body> element of the current document in pixels."
      },
      "characterSet": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.characterSet",
        "!doc": "Returns the character encoding of the current document."
      },
      "readyState": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.readyState",
        "!doc": "Returns \"loading\" while the document is loading, \"interactive\" once it is finished parsing but still loading sub-resources, and \"complete\" once it has loaded."
      },
      "location": {
        "!type": "location",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.location",
        "!doc": "Returns a Location object, which contains information about the URL of the document and provides methods for changing that URL."
      },
      "lastModified": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.lastModified",
        "!doc": "Returns a string containing the date and time on which the current document was last modified."
      },
      "head": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.head",
        "!doc": "Returns the <head> element of the current document. If there are more than one <head> elements, the first one is returned."
      },
      "body": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.body",
        "!doc": "Returns the <body> or <frameset> node of the current document."
      },
      "cookie": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.cookie",
        "!doc": "Get and set the cookies associated with the current document."
      },
      "URL": "string",
      "domain": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.domain",
        "!doc": "Gets/sets the domain portion of the origin of the current document, as used by the same origin policy."
      },
      "referrer": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.referrer",
        "!doc": "Returns the URI of the page that linked to this page."
      },
      "title": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.title",
        "!doc": "Gets or sets the title of the document."
      },
      "defaultView": {
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.defaultView",
        "!doc": "In browsers returns the window object associated with the document or null if none available."
      },
      "documentURI": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.documentURI",
        "!doc": "Returns the document location as string. It is read-only per DOM4 specification."
      },
      "xmlStandalone": "bool",
      "xmlVersion": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.xmlVersion",
        "!doc": "Returns the version number as specified in the XML declaration (e.g., <?xml version=\"1.0\"?>) or \"1.0\" if the declaration is absent."
      },
      "xmlEncoding": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Document.xmlEncoding",
        "!doc": "Returns the encoding as determined by the XML declaration. Should be null if unspecified or unknown."
      },
      "inputEncoding": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.inputEncoding",
        "!doc": "Returns a string representing the encoding under which the document was parsed (e.g. ISO-8859-1)."
      },
      "documentElement": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.documentElement",
        "!doc": "Read-only"
      },
      "implementation": {
        "hasFeature": "fn(feature: string, version: number) -> bool",
        "createDocumentType": {
          "!type": "fn(qualifiedName: string, publicId: string, systemId: string) -> +Node",
          "!url": "https://developer.mozilla.org/en/docs/DOM/DOMImplementation.createDocumentType",
          "!doc": "Returns a DocumentType object which can either be used with DOMImplementation.createDocument upon document creation or they can be put into the document via Node.insertBefore() or Node.replaceChild(): http://www.w3.org/TR/DOM-Level-3-Cor...l#ID-B63ED1A31 (less ideal due to features not likely being as accessible: http://www.w3.org/TR/DOM-Level-3-Cor...createDocument ). In any case, entity declarations and notations will not be available: http://www.w3.org/TR/DOM-Level-3-Cor...-createDocType   "
        },
        "createHTMLDocument": {
          "!type": "fn(title: string) -> +Document",
          "!url": "https://developer.mozilla.org/en/docs/DOM/DOMImplementation.createHTMLDocument",
          "!doc": "This method (available from document.implementation) creates a new HTML document."
        },
        "createDocument": {
          "!type": "fn(namespaceURI: string, qualifiedName: string, type: +Node) -> +Document",
          "!url": "https://developer.mozilla.org/en-US/docs/DOM/DOMImplementation.createHTMLDocument",
          "!doc": "This method creates a new HTML document."
        },
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.implementation",
        "!doc": "Returns a DOMImplementation object associated with the current document."
      },
      "doctype": {
        "!type": "+Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.doctype",
        "!doc": "Returns the Document Type Declaration (DTD) associated with current document. The returned object implements the DocumentType interface. Use DOMImplementation.createDocumentType() to create a DocumentType."
      },
      "open": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.open",
        "!doc": "The document.open() method opens a document for writing."
      },
      "close": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.close",
        "!doc": "The document.close() method finishes writing to a document, opened with document.open()."
      },
      "write": {
        "!type": "fn(html: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.write",
        "!doc": "Writes a string of text to a document stream opened by document.open()."
      },
      "writeln": {
        "!type": "fn(html: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.writeln",
        "!doc": "Writes a string of text followed by a newline character to a document."
      },
      "clear": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.clear",
        "!doc": "In recent versions of Mozilla-based applications as well as in Internet Explorer and Netscape 4 this method does nothing."
      },
      "hasFocus": {
        "!type": "fn() -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.hasFocus",
        "!doc": "Returns a Boolean value indicating whether the document or any element inside the document has focus. This method can be used to determine whether the active element in a document has focus."
      },
      "createElement": {
        "!type": "fn(tagName: string) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createElement",
        "!doc": "Creates the specified element."
      },
      "createElementNS": {
        "!type": "fn(ns: string, tagName: string) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createElementNS",
        "!doc": "Creates an element with the specified namespace URI and qualified name."
      },
      "createDocumentFragment": {
        "!type": "fn() -> +DocumentFragment",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createDocumentFragment",
        "!doc": "Creates a new empty DocumentFragment."
      },
      "createTextNode": {
        "!type": "fn(content: string) -> +Text",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createTextNode",
        "!doc": "Creates a new Text node."
      },
      "createComment": {
        "!type": "fn(content: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createComment",
        "!doc": "Creates a new comment node, and returns it."
      },
      "createCDATASection": {
        "!type": "fn(content: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createCDATASection",
        "!doc": "Creates a new CDATA section node, and returns it. "
      },
      "createProcessingInstruction": {
        "!type": "fn(content: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createProcessingInstruction",
        "!doc": "Creates a new processing instruction node, and returns it."
      },
      "createAttribute": {
        "!type": "fn(name: string) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createAttribute",
        "!doc": "Creates a new attribute node, and returns it."
      },
      "createAttributeNS": {
        "!type": "fn(ns: string, name: string) -> +Attr",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
        "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
      },
      "importNode": {
        "!type": "fn(node: +Node, deep: bool) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.importNode",
        "!doc": "Creates a copy of a node from an external document that can be inserted into the current document."
      },
      "getElementById": {
        "!type": "fn(id: string) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementById",
        "!doc": "Returns a reference to the element by its ID."
      },
      "getElementsByTagName": {
        "!type": "fn(tagName: string) -> +NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByTagName",
        "!doc": "Returns a NodeList of elements with the given tag name. The complete document is searched, including the root node. The returned NodeList is live, meaning that it updates itself automatically to stay in sync with the DOM tree without having to call document.getElementsByTagName again."
      },
      "getElementsByTagNameNS": {
        "!type": "fn(ns: string, tagName: string) -> +NodeList",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByTagNameNS",
        "!doc": "Returns a list of elements with the given tag name belonging to the given namespace. The complete document is searched, including the root node."
      },
      "createEvent": {
        "!type": "fn(type: string) -> +Event",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createEvent",
        "!doc": "Creates an event of the type specified. The returned object should be first initialized and can then be passed to element.dispatchEvent."
      },
      "createRange": {
        "!type": "fn() -> +Range",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createRange",
        "!doc": "Returns a new Range object."
      },
      "evaluate": {
        "!type": "fn(expr: ?) -> +XPathResult",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.evaluate",
        "!doc": "Returns an XPathResult based on an XPath expression and other given parameters."
      },
      "execCommand": {
        "!type": "fn(cmd: string)",
        "!url": "https://developer.mozilla.org/en-US/docs/Rich-Text_Editing_in_Mozilla#Executing_Commands",
        "!doc": "Run command to manipulate the contents of an editable region."
      },
      "queryCommandEnabled": {
        "!type": "fn(cmd: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document",
        "!doc": "Returns true if the Midas command can be executed on the current range."
      },
      "queryCommandIndeterm": {
        "!type": "fn(cmd: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document",
        "!doc": "Returns true if the Midas command is in a indeterminate state on the current range."
      },
      "queryCommandState": {
        "!type": "fn(cmd: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document",
        "!doc": "Returns true if the Midas command has been executed on the current range."
      },
      "queryCommandSupported": {
        "!type": "fn(cmd: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.queryCommandSupported",
        "!doc": "Reports whether or not the specified editor query command is supported by the browser."
      },
      "queryCommandValue": {
        "!type": "fn(cmd: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document",
        "!doc": "Returns the current value of the current range for Midas command."
      },
      "getElementsByName": {
        "!type": "fn(name: string) -> +HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.getElementsByName",
        "!doc": "Returns a list of elements with a given name in the HTML document."
      },
      "elementFromPoint": {
        "!type": "fn(x: number, y: number) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.elementFromPoint",
        "!doc": "Returns the element from the document whose elementFromPoint method is being called which is the topmost element which lies under the given point.  To get an element, specify the point via coordinates, in CSS pixels, relative to the upper-left-most point in the window or frame containing the document."
      },
      "getSelection": {
        "!type": "fn() -> +Selection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.getSelection",
        "!doc": "The DOM getSelection() method is available on the Window and Document interfaces."
      },
      "adoptNode": {
        "!type": "fn(node: +Node) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.adoptNode",
        "!doc": "Adopts a node from an external document. The node and its subtree is removed from the document it's in (if any), and its ownerDocument is changed to the current document. The node can then be inserted into the current document."
      },
      "createTreeWalker": {
        "!type": "fn(root: +Node, mask: number) -> ?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createTreeWalker",
        "!doc": "Returns a new TreeWalker object."
      },
      "createExpression": {
        "!type": "fn(text: string) -> ?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createExpression",
        "!doc": "This method compiles an XPathExpression which can then be used for (repeated) evaluations."
      },
      "createNSResolver": {
        "!type": "fn(node: +Node)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.createNSResolver",
        "!doc": "Creates an XPathNSResolver which resolves namespaces with respect to the definitions in scope for a specified node."
      },
      "scripts": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Document.scripts",
        "!doc": "Returns a list of the <script> elements in the document. The returned object is an HTMLCollection."
      },
      "plugins": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.plugins",
        "!doc": "Returns an HTMLCollection object containing one or more HTMLEmbedElements or null which represent the <embed> elements in the current document."
      },
      "embeds": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.embeds",
        "!doc": "Returns a list of the embedded OBJECTS within the current document."
      },
      "anchors": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.anchors",
        "!doc": "Returns a list of all of the anchors in the document."
      },
      "links": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.links",
        "!doc": "The links property returns a collection of all AREA elements and anchor elements in a document with a value for the href attribute. "
      },
      "forms": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.forms",
        "!doc": "Returns a collection (an HTMLCollection) of the form elements within the current document."
      },
      "styleSheets": {
        "!type": "+HTMLCollection",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.styleSheets",
        "!doc": "Returns a list of stylesheet objects for stylesheets explicitly linked into or embedded in a document."
      },
      "currentScript": {
        "!type": "+Node",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/document.currentScript",
        "!doc": "Returns the <script> element whose script is currently being processed."
      },
      "registerElement": {
        "!type": "fn(type: string, options?: ?)",
        "!url": "http://w3c.github.io/webcomponents/spec/custom/#extensions-to-document-interface-to-register",
        "!doc": "The registerElement method of the Document interface provides a way to register a custom element and returns its custom element constructor."
      },
      "getElementsByClassName": "Element.prototype.getElementsByClassName",
      "querySelector": "Element.prototype.querySelector",
      "querySelectorAll": "Element.prototype.querySelectorAll"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/document",
    "!doc": "Each web page loaded in the browser has its own document object. This object serves as an entry point to the web page's content (the DOM tree, including elements such as <body> and <table>) and provides functionality global to the document (such as obtaining the page's URL and creating new elements in the document)."
  },
  "document": {
    "!type": "+Document",
    "!url": "https://developer.mozilla.org/en/docs/DOM/document",
    "!doc": "Each web page loaded in the browser has its own document object. This object serves as an entry point to the web page's content (the DOM tree, including elements such as <body> and <table>) and provides functionality global to the document (such as obtaining the page's URL and creating new elements in the document)."
  },
  "XMLDocument": {
    "!type": "fn()",
    "prototype": "Document.prototype",
    "!url": "https://developer.mozilla.org/en/docs/Parsing_and_serializing_XML",
    "!doc": "The Web platform provides the following objects for parsing and serializing XML:"
  },
  "HTMLElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement"
  },
  "HTMLAnchorElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement"
  },
  "HTMLAreaElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLAreaElement"
  },
  "HTMLAudioElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement"
  },
  "HTMLBaseElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLBaseElement"
  },
  "HTMLBodyElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLBodyElement"
  },
  "HTMLBRElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLBRElement"
  },
  "HTMLButtonElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLButtonElement"
  },
  "HTMLCanvasElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement"
  },
  "HTMLDataElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDataElement"
  },
  "HTMLDataListElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDataListElement"
  },
  "HTMLDivElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDivElement"
  },
  "HTMLDListElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDListElement"
  },
  "HTMLDocument": {
    "!type": "Document",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLDocument"
  },
  "HTMLEmbedElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLEmbedElement"
  },
  "HTMLFieldSetElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLFieldSetElement"
  },
  "HTMLFormControlsCollection": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormControlsCollection"
  },
  "HTMLFormElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement"
  },
  "HTMLHeadElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHeadElement"
  },
  "HTMLHeadingElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHeadingElement"
  },
  "HTMLHRElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHRElement"
  },
  "HTMLHtmlElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLHtmlElement"
  },
  "HTMLIFrameElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLIFrameElement"
  },
  "HTMLImageElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement"
  },
  "HTMLInputElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement"
  },
  "HTMLKeygenElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLKeygenElement"
  },
  "HTMLLabelElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLabelElement"
  },
  "HTMLLegendElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLegendElement"
  },
  "HTMLLIElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLIElement"
  },
  "HTMLLinkElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLLinkElement"
  },
  "HTMLMapElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMapElement"
  },
  "HTMLMediaElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement"
  },
  "HTMLMetaElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMetaElement"
  },
  "HTMLMeterElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMeterElement"
  },
  "HTMLModElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLModElement"
  },
  "HTMLObjectElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLObjectElement"
  },
  "HTMLOListElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOListElement"
  },
  "HTMLOptGroupElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptGroupElement"
  },
  "HTMLOptionElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptionElement"
  },
  "HTMLOptionsCollection": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptionsCollection"
  },
  "HTMLOutputElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLOutputElement"
  },
  "HTMLParagraphElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLParagraphElement"
  },
  "HTMLParamElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLParamElement"
  },
  "HTMLPreElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLPreElement"
  },
  "HTMLProgressElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLProgressElement"
  },
  "HTMLQuoteElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLQuoteElement"
  },
  "HTMLScriptElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement"
  },
  "HTMLSelectElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLSelectElement"
  },
  "HTMLSourceElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLSourceElement"
  },
  "HTMLSpanElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLSpanElement"
  },
  "HTMLStyleElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLStyleElement"
  },
  "HTMLTableCaptionElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableCaptionElement"
  },
  "HTMLTableCellElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableCellElement"
  },
  "HTMLTableColElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableColElement"
  },
  "HTMLTableDataCellElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableDataCellElement"
  },
  "HTMLTableElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableElement"
  },
  "HTMLTableHeaderCellElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableHeaderCellElement"
  },
  "HTMLTableRowElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableRowElement"
  },
  "HTMLTableSectionElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTableSectionElement"
  },
  "HTMLTextAreaElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement"
  },
  "HTMLTimeElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTimeElement"
  },
  "HTMLTitleElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTitleElement"
  },
  "HTMLTrackElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLTrackElement"
  },
  "HTMLUListElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLUListElement"
  },
  "HTMLUnknownElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLUnknownElement"
  },
  "HTMLVideoElement": {
    "!type": "Element",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement"
  },
  "Attr": {
    "!type": "fn()",
    "prototype": {
      "isId": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
        "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
      },
      "name": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
        "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
      },
      "value": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
        "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Attr",
    "!doc": "This type represents a DOM element's attribute as an object. In most DOM methods, you will probably directly retrieve the attribute as a string (e.g., Element.getAttribute(), but certain functions (e.g., Element.getAttributeNode()) or means of iterating give Attr types."
  },
  "NodeList": {
    "!type": "fn()",
    "prototype": {
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.length",
        "!doc": "Returns the number of items in a NodeList."
      },
      "item": {
        "!type": "fn(i: number) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NodeList.item",
        "!doc": "Returns a node from a NodeList by index."
      },
      "<i>": "+Element"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/NodeList",
    "!doc": "NodeList objects are collections of nodes returned by getElementsByTagName, getElementsByTagNameNS, Node.childNodes, querySelectorAll, getElementsByClassName, etc."
  },
  "HTMLCollection": {
    "!type": "fn()",
    "prototype": {
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
        "!doc": "The number of items in the collection."
      },
      "item": {
        "!type": "fn(i: number) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
        "!doc": "Returns the specific node at the given zero-based index into the list. Returns null if the index is out of range."
      },
      "namedItem": {
        "!type": "fn(name: string) -> +Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
        "!doc": "Returns the specific node whose ID or, as a fallback, name matches the string specified by name. Matching by name is only done as a last resort, only in HTML, and only if the referenced element supports the name attribute. Returns null if no node exists by the given name."
      },
      "<i>": "+Element"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/HTMLCollection",
    "!doc": "HTMLCollection is an interface representing a generic collection of elements (in document order) and offers methods and properties for traversing the list."
  },
  "NamedNodeMap": {
    "!type": "fn()",
    "prototype": {
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "The number of items in the map."
      },
      "getNamedItem": {
        "!type": "fn(name: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Gets a node by name."
      },
      "setNamedItem": {
        "!type": "fn(node: +Node) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Adds (or replaces) a node by its nodeName."
      },
      "removeNamedItem": {
        "!type": "fn(name: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Removes a node (or if an attribute, may reveal a default if present)."
      },
      "item": {
        "!type": "fn(i: number) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Returns the item at the given index (or null if the index is higher or equal to the number of nodes)."
      },
      "getNamedItemNS": {
        "!type": "fn(ns: string, name: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Gets a node by namespace and localName."
      },
      "setNamedItemNS": {
        "!type": "fn(node: +Node) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Adds (or replaces) a node by its localName and namespaceURI."
      },
      "removeNamedItemNS": {
        "!type": "fn(ns: string, name: string) -> +Node",
        "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
        "!doc": "Removes a node (or if an attribute, may reveal a default if present)."
      },
      "<i>": "+Node"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/NamedNodeMap",
    "!doc": "A collection of nodes returned by Element.attributes (also potentially for DocumentType.entities, DocumentType.notations). NamedNodeMaps are not in any particular order (unlike NodeList), although they may be accessed by an index as in an array (they may also be accessed with the item() method). A NamedNodeMap object are live and will thus be auto-updated if changes are made to their contents internally or elsewhere."
  },
  "DocumentFragment": {
    "!type": "fn()",
    "prototype": {
      "!proto": "Node.prototype"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/document.createDocumentFragment",
    "!doc": "Creates a new empty DocumentFragment."
  },
  "DOMTokenList": {
    "!type": "fn()",
    "prototype": {
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "The amount of items in the list."
      },
      "item": {
        "!type": "fn(i: number) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "Returns an item in the list by its index."
      },
      "contains": {
        "!type": "fn(token: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "Return true if the underlying string contains token, otherwise false."
      },
      "add": {
        "!type": "fn(token: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "Adds token to the underlying string."
      },
      "remove": {
        "!type": "fn(token: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "Remove token from the underlying string."
      },
      "toggle": {
        "!type": "fn(token: string) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
        "!doc": "Removes token from string and returns false. If token doesn't exist it's added and the function returns true."
      },
      "<i>": "string"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/DOMTokenList",
    "!doc": "This type represents a set of space-separated tokens. Commonly returned by HTMLElement.classList, HTMLLinkElement.relList, HTMLAnchorElement.relList or HTMLAreaElement.relList. It is indexed beginning with 0 as with JavaScript arrays. DOMTokenList is always case-sensitive."
  },
  "XPathResult": {
    "!type": "fn()",
    "prototype": {
      "boolValue": "bool",
      "invalidIteratorState": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
        "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
      },
      "numberValue": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/XPathResult",
        "!doc": "Refer to nsIDOMXPathResult for more detail."
      },
      "resultType": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/document.evaluate",
        "!doc": "Returns an XPathResult based on an XPath expression and other given parameters."
      },
      "singleNodeValue": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
        "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
      },
      "snapshotLength": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/XPathResult",
        "!doc": "Refer to nsIDOMXPathResult for more detail."
      },
      "stringValue": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
        "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
      },
      "iterateNext": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript",
        "!doc": "This document describes the interface for using XPath in JavaScript internally, in extensions, and from websites. Mozilla implements a fair amount of the DOM 3 XPath. Which means that XPath expressions can be run against both HTML and XML documents."
      },
      "snapshotItem": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en-US/docs/XPathResult#snapshotItem()"
      },
      "ANY_TYPE": "number",
      "NUMBER_TYPE": "number",
      "STRING_TYPE": "number",
      "BOOL_TYPE": "number",
      "UNORDERED_NODE_ITERATOR_TYPE": "number",
      "ORDERED_NODE_ITERATOR_TYPE": "number",
      "UNORDERED_NODE_SNAPSHOT_TYPE": "number",
      "ORDERED_NODE_SNAPSHOT_TYPE": "number",
      "ANY_UNORDERED_NODE_TYPE": "number",
      "FIRST_ORDERED_NODE_TYPE": "number"
    },
    "!url": "https://developer.mozilla.org/en/docs/XPathResult",
    "!doc": "Refer to nsIDOMXPathResult for more detail."
  },
  "ClientRect": {
    "!type": "fn()",
    "prototype": {
      "top": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
        "!doc": "Top of the box, in pixels, relative to the viewport."
      },
      "left": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
        "!doc": "Left of the box, in pixels, relative to the viewport."
      },
      "bottom": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
        "!doc": "Bottom of the box, in pixels, relative to the viewport."
      },
      "right": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
        "!doc": "Right of the box, in pixels, relative to the viewport."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.getClientRects",
    "!doc": "Returns a collection of rectangles that indicate the bounding rectangles for each box in a client."
  },
  "Event": {
    "!type": "fn()",
    "prototype": {
      "stopPropagation": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.stopPropagation",
        "!doc": "Prevents further propagation of the current event."
      },
      "preventDefault": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.preventDefault",
        "!doc": "Cancels the event if it is cancelable, without stopping further propagation of the event."
      },
      "initEvent": {
        "!type": "fn(type: string, bubbles: bool, cancelable: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.initEvent",
        "!doc": "The initEvent method is used to initialize the value of an event created using document.createEvent."
      },
      "stopImmediatePropagation": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.stopImmediatePropagation",
        "!doc": "Prevents other listeners of the same event to be called."
      },
      "type": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/API/event.type",
        "!doc": "Returns a string containing the type of event."
      },
      "NONE": "number",
      "CAPTURING_PHASE": "number",
      "AT_TARGET": "number",
      "BUBBLING_PHASE": "number",
      "MOUSEDOWN": "number",
      "MOUSEUP": "number",
      "MOUSEOVER": "number",
      "MOUSEOUT": "number",
      "MOUSEMOVE": "number",
      "MOUSEDRAG": "number",
      "CLICK": "number",
      "DBLCLICK": "number",
      "KEYDOWN": "number",
      "KEYUP": "number",
      "KEYPRESS": "number",
      "DRAGDROP": "number",
      "FOCUS": "number",
      "BLUR": "number",
      "SELECT": "number",
      "CHANGE": "number",
      "target": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget",
        "!doc": "An EventTarget is a DOM interface implemented by objects that can receive DOM events and have listeners for them. The most common EventTargets are DOM elements, although other objects can be EventTargets too, for example document, window, XMLHttpRequest, and others."
      },
      "relatedTarget": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.relatedTarget",
        "!doc": "Identifies a secondary target for the event."
      },
      "pageX": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.pageX",
        "!doc": "Returns the horizontal coordinate of the event relative to whole document."
      },
      "pageY": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.pageY",
        "!doc": "Returns the vertical coordinate of the event relative to the whole document."
      },
      "clientX": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.clientX",
        "!doc": "Returns the horizontal coordinate within the application's client area at which the event occurred (as opposed to the coordinates within the page). For example, clicking in the top-left corner of the client area will always result in a mouse event with a clientX value of 0, regardless of whether the page is scrolled horizontally."
      },
      "clientY": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.clientY",
        "!doc": "Returns the vertical coordinate within the application's client area at which the event occurred (as opposed to the coordinates within the page). For example, clicking in the top-left corner of the client area will always result in a mouse event with a clientY value of 0, regardless of whether the page is scrolled vertically."
      },
      "keyCode": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.keyCode",
        "!doc": "Returns the Unicode value of a non-character key in a keypress event or any key in any other type of keyboard event."
      },
      "charCode": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.charCode",
        "!doc": "Returns the Unicode value of a character key pressed during a keypress event."
      },
      "which": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.which",
        "!doc": "Returns the numeric keyCode of the key pressed, or the character code (charCode) for an alphanumeric key pressed."
      },
      "button": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.button",
        "!doc": "Indicates which mouse button caused the event."
      },
      "shiftKey": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.shiftKey",
        "!doc": "Indicates whether the SHIFT key was pressed when the event fired."
      },
      "ctrlKey": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.ctrlKey",
        "!doc": "Indicates whether the CTRL key was pressed when the event fired."
      },
      "altKey": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.altKey",
        "!doc": "Indicates whether the ALT key was pressed when the event fired."
      },
      "metaKey": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.metaKey",
        "!doc": "Indicates whether the META key was pressed when the event fired."
      },
      "returnValue": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/window.onbeforeunload",
        "!doc": "An event that fires when a window is about to unload its resources. The document is still visible and the event is still cancelable."
      },
      "cancelBubble": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/event.cancelBubble",
        "!doc": "bool is the boolean value of true or false."
      },
      "dataTransfer": {
        "dropEffect": {
          "!type": "string",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
          "!doc": "The actual effect that will be used, and should always be one of the possible values of effectAllowed."
        },
        "effectAllowed": {
          "!type": "string",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
          "!doc": "Specifies the effects that are allowed for this drag."
        },
        "files": {
          "!type": "+FileList",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
          "!doc": "Contains a list of all the local files available on the data transfer."
        },
        "types": {
          "!type": "[string]",
          "!url": "https://developer.mozilla.org/en-US/docs/DragDrop/DataTransfer",
          "!doc": "Holds a list of the format types of the data that is stored for the first item, in the same order the data was added. An empty list will be returned if no data was added."
        },
        "addElement": {
          "!type": "fn(element: +Element)",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
          "!doc": "Set the drag source."
        },
        "clearData": {
          "!type": "fn(type?: string)",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
          "!doc": "Remove the data associated with a given type."
        },
        "getData": {
          "!type": "fn(type: string) -> string",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
          "!doc": "Retrieves the data for a given type, or an empty string if data for that type does not exist or the data transfer contains no data."
        },
        "setData": {
          "!type": "fn(type: string, data: string)",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
          "!doc": "Set the data for a given type."
        },
        "setDragImage": {
          "!type": "fn(image: +Element)",
          "!url": "https://developer.mozilla.org/en/docs/DragDrop/Drag_Operations",
          "!doc": "Set the image to be used for dragging if a custom one is desired."
        },
        "!url": "https://developer.mozilla.org/en/docs/DragDrop/DataTransfer",
        "!doc": "This object is available from the dataTransfer property of all drag events. It cannot be created separately."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/event",
    "!doc": "The DOM Event interface is accessible from within the handler function, via the event object passed as the first argument."
  },
  "TouchEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/Touch_events",
    "!doc": "In order to provide quality support for touch-based user interfaces, touch events offer the ability to interpret finger activity on touch screens or trackpads."
  },
  "WheelEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/WheelEvent",
    "!doc": "The DOM WheelEvent represents events that occur due to the user moving a mouse wheel or similar input device."
  },
  "MouseEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/MouseEvent",
    "!doc": "The DOM MouseEvent represents events that occur due to the user interacting with a pointing device (such as a mouse). It's represented by the nsINSDOMMouseEvent interface, which extends the nsIDOMMouseEvent interface."
  },
  "KeyboardEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/KeyboardEvent",
    "!doc": "KeyboardEvent objects describe a user interaction with the keyboard. Each event describes a key; the event type (keydown, keypress, or keyup) identifies what kind of activity was performed."
  },
  "HashChangeEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onhashchange",
    "!doc": "The hashchange event fires when a window's hash changes."
  },
  "ErrorEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/DOM_event_reference/error",
    "!doc": "The error event is fired whenever a resource fails to load."
  },
  "CustomEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/Event/CustomEvent",
    "!doc": "The DOM CustomEvent are events initialized by an application for any purpose."
  },
  "BeforeLoadEvent": {
    "!type": "fn()",
    "prototype": "Event.prototype",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window",
    "!doc": "This section provides a brief reference for all of the methods, properties, and events available through the DOM window object. The window object implements the Window interface, which in turn inherits from the AbstractView interface. Some additional global functions, namespaces objects, and constructors, not typically associated with the window, but available on it, are listed in the JavaScript Reference."
  },
  "WebSocket": {
    "!type": "fn(url: string)",
    "prototype": {
      "close": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/CloseEvent",
        "!doc": "A CloseEvent is sent to clients using WebSockets when the connection is closed. This is delivered to the listener indicated by the WebSocket object's onclose attribute."
      },
      "send": {
        "!type": "fn(data: string)",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
        "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
      },
      "binaryType": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
        "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
      },
      "bufferedAmount": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/Writing_WebSocket_client_applications",
        "!doc": "WebSockets is a technology that makes it possible to open an interactive communication session between the user's browser and a server. Using a WebSocket connection, Web applications can perform real-time communication instead of having to poll for changes back and forth."
      },
      "extensions": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
        "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
      },
      "onclose": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/CloseEvent",
        "!doc": "A CloseEvent is sent to clients using WebSockets when the connection is closed. This is delivered to the listener indicated by the WebSocket object's onclose attribute."
      },
      "onerror": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/Writing_WebSocket_client_applications",
        "!doc": "WebSockets is a technology that makes it possible to open an interactive communication session between the user's browser and a server. Using a WebSocket connection, Web applications can perform real-time communication instead of having to poll for changes back and forth."
      },
      "onmessage": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
        "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
      },
      "onopen": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/WebSockets_reference/WebSocket",
        "!doc": "The WebSocket object provides the API for creating and managing a WebSocket connection to a server, as well as for sending and receiving data on the connection."
      },
      "protocol": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets",
        "!doc": "WebSockets is an advanced technology that makes it possible to open an interactive communication session between the user's browser and a server. With this API, you can send messages to a server and receive event-driven responses without having to poll the server for a reply."
      },
      "url": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/WebSockets/Writing_WebSocket_client_applications",
        "!doc": "WebSockets is a technology that makes it possible to open an interactive communication session between the user's browser and a server. Using a WebSocket connection, Web applications can perform real-time communication instead of having to poll for changes back and forth."
      },
      "CONNECTING": "number",
      "OPEN": "number",
      "CLOSING": "number",
      "CLOSED": "number"
    },
    "!url": "https://developer.mozilla.org/en/docs/WebSockets",
    "!doc": "WebSockets is an advanced technology that makes it possible to open an interactive communication session between the user's browser and a server. With this API, you can send messages to a server and receive event-driven responses without having to poll the server for a reply."
  },
  "Worker": {
    "!type": "fn(scriptURL: string)",
    "prototype": {
      "postMessage": {
        "!type": "fn(message: ?)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
        "!doc": "Sends a message to the worker's inner scope. This accepts a single parameter, which is the data to send to the worker. The data may be any value or JavaScript object handled by the structured clone algorithm, which includes cyclical references."
      },
      "terminate": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
        "!doc": "Immediately terminates the worker. This does not offer the worker an opportunity to finish its operations; it is simply stopped at once."
      },
      "onmessage": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
        "!doc": "An event listener that is called whenever a MessageEvent with type message bubbles through the worker. The message is stored in the event's data member."
      },
      "onerror": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
        "!doc": "An event listener that is called whenever an ErrorEvent with type error bubbles through the worker."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
    "!doc": "Workers are background tasks that can be easily created and can send messages back to their creators. Creating a worker is as simple as calling the Worker() constructor, specifying a script to be run in the worker thread."
  },
  "localStorage": {
    "setItem": {
      "!type": "fn(name: string, value: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
      "!doc": "Store an item in storage."
    },
    "getItem": {
      "!type": "fn(name: string) -> string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
      "!doc": "Retrieve an item from storage."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
    "!doc": "The DOM Storage mechanism is a means through which string key/value pairs can be securely stored and later retrieved for use."
  },
  "sessionStorage": {
    "setItem": {
      "!type": "fn(name: string, value: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
      "!doc": "Store an item in storage."
    },
    "getItem": {
      "!type": "fn(name: string) -> string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
      "!doc": "Retrieve an item from storage."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Storage",
    "!doc": "This is a global object (sessionStorage) that maintains a storage area that's available for the duration of the page session. A page session lasts for as long as the browser is open and survives over page reloads and restores. Opening a page in a new tab or window will cause a new session to be initiated."
  },
  "FileList": {
    "!type": "fn()",
    "prototype": {
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileList",
        "!doc": "A read-only value indicating the number of files in the list."
      },
      "item": {
        "!type": "fn(i: number) -> +File",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileList",
        "!doc": "Returns a File object representing the file at the specified index in the file list."
      },
      "<i>": "+File"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/FileList",
    "!doc": "An object of this type is returned by the files property of the HTML input element; this lets you access the list of files selected with the <input type=\"file\"> element. It's also used for a list of files dropped into web content when using the drag and drop API."
  },
  "File": {
    "!type": "fn()",
    "prototype": {
      "!proto": "Blob.prototype",
      "fileName": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/File.fileName",
        "!doc": "Returns the name of the file. For security reasons the path is excluded from this property."
      },
      "fileSize": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/File.fileSize",
        "!doc": "Returns the size of a file in bytes."
      },
      "lastModifiedDate": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/File.lastModifiedDate",
        "!doc": "Returns the last modified date of the file. Files without a known last modified date use the current date instead."
      },
      "name": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/File.name",
        "!doc": "Returns the name of the file. For security reasons, the path is excluded from this property."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/File",
    "!doc": "The File object provides information about -- and access to the contents of -- files. These are generally retrieved from a FileList object returned as a result of a user selecting files using the input element, or from a drag and drop operation's DataTransfer object."
  },
  "Blob": {
    "!type": "fn(parts: [?], properties?: ?)",
    "prototype": {
      "size": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
        "!doc": "The size, in bytes, of the data contained in the Blob object. Read only."
      },
      "type": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
        "!doc": "An ASCII-encoded string, in all lower case, indicating the MIME type of the data contained in the Blob. If the type is unknown, this string is empty. Read only."
      },
      "slice": {
        "!type": "fn(start: number, end?: number, type?: string) -> +Blob",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
        "!doc": "Returns a new Blob object containing the data in the specified range of bytes of the source Blob."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Blob",
    "!doc": "A Blob object represents a file-like object of immutable, raw data. Blobs represent data that isn't necessarily in a JavaScript-native format. The File interface is based on Blob, inheriting blob functionality and expanding it to support files on the user's system."
  },
  "FileReader": {
    "!type": "fn()",
    "prototype": {
      "abort": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Aborts the read operation. Upon return, the readyState will be DONE."
      },
      "readAsArrayBuffer": {
        "!type": "fn(blob: +Blob)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Starts reading the contents of the specified Blob, producing an ArrayBuffer."
      },
      "readAsBinaryString": {
        "!type": "fn(blob: +Blob)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Starts reading the contents of the specified Blob, producing raw binary data."
      },
      "readAsDataURL": {
        "!type": "fn(blob: +Blob)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Starts reading the contents of the specified Blob, producing a data: url."
      },
      "readAsText": {
        "!type": "fn(blob: +Blob, encoding?: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Starts reading the contents of the specified Blob, producing a string."
      },
      "EMPTY": "number",
      "LOADING": "number",
      "DONE": "number",
      "error": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "The error that occurred while reading the file. Read only."
      },
      "readyState": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Indicates the state of the FileReader. This will be one of the State constants. Read only."
      },
      "result": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "The file's contents. This property is only valid after the read operation is complete, and the format of the data depends on which of the methods was used to initiate the read operation. Read only."
      },
      "onabort": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Called when the read operation is aborted."
      },
      "onerror": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Called when an error occurs."
      },
      "onload": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Called when the read operation is successfully completed."
      },
      "onloadend": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Called when the read is completed, whether successful or not. This is called after either onload or onerror."
      },
      "onloadstart": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Called when reading the data is about to begin."
      },
      "onprogress": {
        "!type": "?",
        "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
        "!doc": "Called periodically while the data is being read."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/FileReader",
    "!doc": "The FileReader object lets web applications asynchronously read the contents of files (or raw data buffers) stored on the user's computer, using File or Blob objects to specify the file or data to read. File objects may be obtained from a FileList object returned as a result of a user selecting files using the <input> element, from a drag and drop operation's DataTransfer object, or from the mozGetAsFile() API on an HTMLCanvasElement."
  },
  "URL": {
    "createObjectURL": {
      "!type": "fn(blob: +Blob) -> string",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/API/URL.createObjectURL",
      "!doc": "The URL.createObjectURL() static method creates a DOMString containing an URL representing the object given in parameter."

    },
    "revokeObjectURL": {
      "!type": "fn(string)",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/API/URL.revokeObjectURL",
      "!doc": "The URL.revokeObjectURL() static method releases an existing object URL which was previously created by calling window.URL.createObjectURL()."
    }
  },
  "Range": {
    "!type": "fn()",
    "prototype": {
      "collapsed": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.collapsed",
        "!doc": "Returns a boolean indicating whether the range's start and end points are at the same position."
      },
      "commonAncestorContainer": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.commonAncestorContainer",
        "!doc": "Returns the deepest Node that contains the  startContainer and  endContainer Nodes."
      },
      "endContainer": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.endContainer",
        "!doc": "Returns the Node within which the Range ends."
      },
      "endOffset": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.endOffset",
        "!doc": "Returns a number representing where in the  endContainer the Range ends."
      },
      "startContainer": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.startContainer",
        "!doc": "Returns the Node within which the Range starts."
      },
      "startOffset": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.startOffset",
        "!doc": "Returns a number representing where in the startContainer the Range starts."
      },
      "setStart": {
        "!type": "fn(node: +Element, offset: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.setStart",
        "!doc": "Sets the start position of a Range."
      },
      "setEnd": {
        "!type": "fn(node: +Element, offset: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.setEnd",
        "!doc": "Sets the end position of a Range."
      },
      "setStartBefore": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.setStartBefore",
        "!doc": "Sets the start position of a Range relative to another Node."
      },
      "setStartAfter": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.setStartAfter",
        "!doc": "Sets the start position of a Range relative to a Node."
      },
      "setEndBefore": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.setEndBefore",
        "!doc": "Sets the end position of a Range relative to another Node."
      },
      "setEndAfter": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.setEndAfter",
        "!doc": "Sets the end position of a Range relative to another Node."
      },
      "selectNode": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.selectNode",
        "!doc": "Sets the Range to contain the Node and its contents."
      },
      "selectNodeContents": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.selectNodeContents",
        "!doc": "Sets the Range to contain the contents of a Node."
      },
      "collapse": {
        "!type": "fn(toStart: bool)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.collapse",
        "!doc": "Collapses the Range to one of its boundary points."
      },
      "cloneContents": {
        "!type": "fn() -> +DocumentFragment",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.cloneContents",
        "!doc": "Returns a DocumentFragment copying the Nodes of a Range."
      },
      "deleteContents": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.deleteContents",
        "!doc": "Removes the contents of a Range from the Document."
      },
      "extractContents": {
        "!type": "fn() -> +DocumentFragment",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.extractContents",
        "!doc": "Moves contents of a Range from the document tree into a DocumentFragment."
      },
      "insertNode": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.insertNode",
        "!doc": "Insert a node at the start of a Range."
      },
      "surroundContents": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.surroundContents",
        "!doc": "Moves content of a Range into a new node, placing the new node at the start of the specified range."
      },
      "compareBoundaryPoints": {
        "!type": "fn(how: number, other: +Range) -> number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.compareBoundaryPoints",
        "!doc": "Compares the boundary points of two Ranges."
      },
      "cloneRange": {
        "!type": "fn() -> +Range",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.cloneRange",
        "!doc": "Returns a Range object with boundary points identical to the cloned Range."
      },
      "detach": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/range.detach",
        "!doc": "Releases a Range from use to improve performance. This lets the browser choose to release resources associated with this Range. Subsequent attempts to use the detached range will result in a DOMException being thrown with an error code of INVALID_STATE_ERR."
      },
      "END_TO_END": "number",
      "END_TO_START": "number",
      "START_TO_END": "number",
      "START_TO_START": "number"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/range.detach",
    "!doc": "Releases a Range from use to improve performance. This lets the browser choose to release resources associated with this Range. Subsequent attempts to use the detached range will result in a DOMException being thrown with an error code of INVALID_STATE_ERR."
  },
  "XMLHttpRequest": {
    "!type": "fn()",
    "prototype": {
      "abort": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Aborts the request if it has already been sent."
      },
      "getAllResponseHeaders": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Returns all the response headers as a string, or null if no response has been received. Note: For multipart requests, this returns the headers from the current part of the request, not from the original channel."
      },
      "getResponseHeader": {
        "!type": "fn(header: string) -> string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Returns the string containing the text of the specified header, or null if either the response has not yet been received or the header doesn't exist in the response."
      },
      "open": {
        "!type": "fn(method: string, url: string, async?: bool, user?: string, password?: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Initializes a request."
      },
      "overrideMimeType": {
        "!type": "fn(type: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Overrides the MIME type returned by the server."
      },
      "send": {
        "!type": "fn(data?: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Sends the request. If the request is asynchronous (which is the default), this method returns as soon as the request is sent. If the request is synchronous, this method doesn't return until the response has arrived."
      },
      "setRequestHeader": {
        "!type": "fn(header: string, value: string)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Sets the value of an HTTP request header.You must call setRequestHeader() after open(), but before send()."
      },
      "onreadystatechange": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "A JavaScript function object that is called whenever the readyState attribute changes."
      },
      "readyState": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "The state of the request. (0=unsent, 1=opened, 2=headers_received, 3=loading, 4=done)"
      },
      "response": {
        "!type": "+Document",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "The response entity body according to responseType, as an ArrayBuffer, Blob, Document, JavaScript object (for \"json\"), or string. This is null if the request is not complete or was not successful."
      },
      "responseText": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "The response to the request as text, or null if the request was unsuccessful or has not yet been sent."
      },
      "responseType": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "Can be set to change the response type."
      },
      "responseXML": {
        "!type": "+Document",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "The response to the request as a DOM Document object, or null if the request was unsuccessful, has not yet been sent, or cannot be parsed as XML or HTML."
      },
      "status": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "The status of the response to the request. This is the HTTP result code"
      },
      "statusText": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
        "!doc": "The response string returned by the HTTP server. Unlike status, this includes the entire text of the response message (\"200 OK\", for example)."
      },
      "timeout": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest/Synchronous_and_Asynchronous_Requests",
        "!doc": "The number of milliseconds a request can take before automatically being terminated. A value of 0 (which is the default) means there is no timeout."
      },
      "UNSENT": "number",
      "OPENED": "number",
      "HEADERS_RECEIVED": "number",
      "LOADING": "number",
      "DONE": "number"
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/XMLHttpRequest",
    "!doc": "XMLHttpRequest is a JavaScript object that was designed by Microsoft and adopted by Mozilla, Apple, and Google. It's now being standardized in the W3C. It provides an easy way to retrieve data at a URL. Despite its name, XMLHttpRequest can be used to retrieve any type of data, not just XML, and it supports protocols other than HTTP (including file and ftp)."
  },
  "DOMParser": {
    "!type": "fn()",
    "prototype": {
      "parseFromString": {
        "!type": "fn(data: string, mime: string) -> +Document",
        "!url": "https://developer.mozilla.org/en/docs/DOM/DOMParser",
        "!doc": "DOMParser can parse XML or HTML source stored in a string into a DOM Document. DOMParser is specified in DOM Parsing and Serialization."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/DOMParser",
    "!doc": "DOMParser can parse XML or HTML source stored in a string into a DOM Document. DOMParser is specified in DOM Parsing and Serialization."
  },
  "Selection": {
    "!type": "fn()",
    "prototype": {
      "anchorNode": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/anchorNode",
        "!doc": "Returns the node in which the selection begins."
      },
      "anchorOffset": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/anchorOffset",
        "!doc": "Returns the number of characters that the selection's anchor is offset within the anchorNode."
      },
      "focusNode": {
        "!type": "+Element",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/focusNode",
        "!doc": "Returns the node in which the selection ends."
      },
      "focusOffset": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/focusOffset",
        "!doc": "Returns the number of characters that the selection's focus is offset within the focusNode. "
      },
      "isCollapsed": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/isCollapsed",
        "!doc": "Returns a boolean indicating whether the selection's start and end points are at the same position."
      },
      "rangeCount": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/rangeCount",
        "!doc": "Returns the number of ranges in the selection."
      },
      "getRangeAt": {
        "!type": "fn(i: number) -> +Range",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/getRangeAt",
        "!doc": "Returns a range object representing one of the ranges currently selected."
      },
      "collapse": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/collapse",
        "!doc": "Collapses the current selection to a single point. The document is not modified. If the content is focused and editable, the caret will blink there."
      },
      "extend": {
        "!type": "fn(node: +Element, offset: number)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/extend",
        "!doc": "Moves the focus of the selection to a specified point. The anchor of the selection does not move. The selection will be from the anchor to the new focus regardless of direction."
      },
      "collapseToStart": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/collapseToStart",
        "!doc": "Collapses the selection to the start of the first range in the selection.  If the content of the selection is focused and editable, the caret will blink there."
      },
      "collapseToEnd": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/collapseToEnd",
        "!doc": "Collapses the selection to the end of the last range in the selection.  If the content the selection is in is focused and editable, the caret will blink there."
      },
      "selectAllChildren": {
        "!type": "fn(node: +Element)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/selectAllChildren",
        "!doc": "Adds all the children of the specified node to the selection. Previous selection is lost."
      },
      "addRange": {
        "!type": "fn(range: +Range)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/addRange",
        "!doc": "Adds a Range to a Selection."
      },
      "removeRange": {
        "!type": "fn(range: +Range)",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/removeRange",
        "!doc": "Removes a range from the selection."
      },
      "removeAllRanges": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/removeAllRanges",
        "!doc": "Removes all ranges from the selection, leaving the anchorNode and focusNode properties equal to null and leaving nothing selected. "
      },
      "deleteFromDocument": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/deleteFromDocument",
        "!doc": "Deletes the actual text being represented by a selection object from the document's DOM."
      },
      "containsNode": {
        "!type": "fn(node: +Element) -> bool",
        "!url": "https://developer.mozilla.org/en/docs/DOM/Selection/containsNode",
        "!doc": "Indicates if the node is part of the selection."
      }
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Selection",
    "!doc": "Selection is the class of the object returned by window.getSelection() and other methods. It represents the text selection in the greater page, possibly spanning multiple elements, when the user drags over static text and other parts of the page. For information about text selection in an individual text editing element."
  },
  "console": {
    "error": {
      "!type": "fn(text: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/console.error",
      "!doc": "Outputs an error message to the Web Console."
    },
    "info": {
      "!type": "fn(text: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/console.info",
      "!doc": "Outputs an informational message to the Web Console."
    },
    "log": {
      "!type": "fn(text: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/console.log",
      "!doc": "Outputs a message to the Web Console."
    },
    "warn": {
      "!type": "fn(text: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/console.warn",
      "!doc": "Outputs a warning message to the Web Console."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/console",
    "!doc": "The console object provides access to the browser's debugging console. The specifics of how it works vary from browser to browser, but there is a de facto set of features that are typically provided."
  },
  "top": {
    "!type": "<top>",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.top",
    "!doc": "Returns a reference to the topmost window in the window hierarchy."
  },
  "parent": {
    "!type": "<top>",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.parent",
    "!doc": "A reference to the parent of the current window or subframe."
  },
  "window": {
    "!type": "<top>",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window",
    "!doc": "The window object represents a window containing a DOM document."
  },
  "opener": {
    "!type": "<top>",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.opener",
    "!doc": "Returns a reference to the window that opened this current window."
  },
  "self": {
    "!type": "<top>",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.self",
    "!doc": "Returns an object reference to the window object. "
  },
  "devicePixelRatio": "number",
  "name": {
    "!type": "string",
    "!url": "https://developer.mozilla.org/en/docs/JavaScript/Reference/Global_Objects/Function/name",
    "!doc": "The name of the function."
  },
  "closed": {
    "!type": "bool",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.closed",
    "!doc": "This property indicates whether the referenced window is closed or not."
  },
  "pageYOffset": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollY",
    "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
  },
  "pageXOffset": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollX",
    "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
  },
  "scrollY": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollY",
    "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
  },
  "scrollX": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollX",
    "!doc": "Returns the number of pixels that the document has already been scrolled vertically."
  },
  "screenTop": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.top",
    "!doc": "Returns the distance in pixels from the top side of the current screen."
  },
  "screenLeft": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.left",
    "!doc": "Returns the distance in pixels from the left side of the main screen to the left side of the current screen."
  },
  "screenY": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/event.screenY",
    "!doc": "Returns the vertical coordinate of the event within the screen as a whole."
  },
  "screenX": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/event.screenX",
    "!doc": "Returns the horizontal coordinate of the event within the screen as a whole."
  },
  "innerWidth": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.innerWidth",
    "!doc": "Width (in pixels) of the browser window viewport including, if rendered, the vertical scrollbar."
  },
  "innerHeight": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.innerHeight",
    "!doc": "Height (in pixels) of the browser window viewport including, if rendered, the horizontal scrollbar."
  },
  "outerWidth": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.outerWidth",
    "!doc": "window.outerWidth gets the width of the outside of the browser window. It represents the width of the whole browser window including sidebar (if expanded), window chrome and window resizing borders/handles."
  },
  "outerHeight": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.outerHeight",
    "!doc": "window.outerHeight gets the height in pixels of the whole browser window."
  },
  "frameElement": {
    "!type": "+Element",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.frameElement",
    "!doc": "Returns the element (such as <iframe> or <object>) in which the window is embedded, or null if the window is top-level."
  },
  "crypto": {
    "getRandomValues": {
      "!type": "fn([number])",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.crypto.getRandomValues",
      "!doc": "This methods lets you get cryptographically random values."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.crypto.getRandomValues",
    "!doc": "This methods lets you get cryptographically random values."
  },
  "navigator": {
    "appName": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.appName",
      "!doc": "Returns the name of the browser. The HTML5 specification also allows any browser to return \"Netscape\" here, for compatibility reasons."
    },
    "appVersion": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.appVersion",
      "!doc": "Returns the version of the browser as a string. It may be either a plain version number, like \"5.0\", or a version number followed by more detailed information. The HTML5 specification also allows any browser to return \"4.0\" here, for compatibility reasons."
    },
    "language": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.language",
      "!doc": "Returns a string representing the language version of the browser."
    },
    "platform": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.platform",
      "!doc": "Returns a string representing the platform of the browser."
    },
    "plugins": {
      "!type": "[?]",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.plugins",
      "!doc": "Returns a PluginArray object, listing the plugins installed in the application."
    },
    "userAgent": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.userAgent",
      "!doc": "Returns the user agent string for the current browser."
    },
    "vendor": {
      "!type": "string",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.vendor",
      "!doc": "Returns the name of the browser vendor for the current browser."
    },
    "javaEnabled": {
      "!type": "bool",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator.javaEnabled",
      "!doc": "This method indicates whether the current browser is Java-enabled or not."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.navigator",
    "!doc": "Returns a reference to the navigator object, which can be queried for information about the application running the script."
  },
  "history": {
    "state": {
      "!type": "?",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
      "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "length": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
      "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "go": {
      "!type": "fn(delta: number)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.history",
      "!doc": "Returns a reference to the History object, which provides an interface for manipulating the browser session history (pages visited in the tab or frame that the current page is loaded in)."
    },
    "forward": {
      "!type": "fn()",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
      "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "back": {
      "!type": "fn()",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
      "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "pushState": {
      "!type": "fn(data: ?, title: string, url?: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
      "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "replaceState": {
      "!type": "fn(data: ?, title: string, url?: string)",
      "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
      "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/Manipulating_the_browser_history",
    "!doc": "The DOM window object provides access to the browser's history through the history object. It exposes useful methods and properties that let you move back and forth through the user's history, as well as -- starting with HTML5 -- manipulate the contents of the history stack."
  },
  "screen": {
    "availWidth": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availWidth",
      "!doc": "Returns the amount of horizontal space in pixels available to the window."
    },
    "availHeight": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availHeight",
      "!doc": "Returns the amount of vertical space available to the window on the screen."
    },
    "availTop": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availTop",
      "!doc": "Specifies the y-coordinate of the first pixel that is not allocated to permanent or semipermanent user interface features."
    },
    "availLeft": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.availLeft",
      "!doc": "Returns the first available pixel available from the left side of the screen."
    },
    "pixelDepth": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.pixelDepth",
      "!doc": "Returns the bit depth of the screen."
    },
    "colorDepth": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.colorDepth",
      "!doc": "Returns the color depth of the screen."
    },
    "width": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.width",
      "!doc": "Returns the width of the screen."
    },
    "height": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen.height",
      "!doc": "Returns the height of the screen in pixels."
    },
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.screen",
    "!doc": "Returns a reference to the screen object associated with the window."
  },
  "postMessage": {
    "!type": "fn(message: string, targetOrigin: string)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.postMessage",
    "!doc": "window.postMessage, when called, causes a MessageEvent to be dispatched at the target window when any pending script that must be executed completes (e.g. remaining event handlers if window.postMessage is called from an event handler, previously-set pending timeouts, etc.). The MessageEvent has the type message, a data property which is set to the value of the first argument provided to window.postMessage, an origin property corresponding to the origin of the main document in the window calling window.postMessage at the time window.postMessage was called, and a source property which is the window from which window.postMessage is called. (Other standard properties of events are present with their expected values.)"
  },
  "close": {
    "!type": "fn()",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.close",
    "!doc": "Closes the current window, or a referenced window."
  },
  "blur": {
    "!type": "fn()",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.blur",
    "!doc": "The blur method removes keyboard focus from the current element."
  },
  "focus": {
    "!type": "fn()",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.focus",
    "!doc": "Sets focus on the specified element, if it can be focused."
  },
  "onload": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onload",
    "!doc": "An event handler for the load event of a window."
  },
  "onunload": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onunload",
    "!doc": "The unload event is raised when the window is unloading its content and resources. The resources removal is processed after the unload event occurs."
  },
  "onscroll": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onscroll",
    "!doc": "Specifies the function to be called when the window is scrolled."
  },
  "onresize": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onresize",
    "!doc": "An event handler for the resize event on the window."
  },
  "ononline": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/document.ononline",
    "!doc": "\"online\" event is fired when the browser switches between online and offline mode."
  },
  "onoffline": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/Online_and_offline_events",
    "!doc": "Some browsers implement Online/Offline events from the WHATWG Web Applications 1.0 specification."
  },
  "onmousewheel": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/DOM_event_reference/mousewheel",
    "!doc": "The DOM mousewheel event is fired asynchronously when mouse wheel or similar device is operated. It's represented by the MouseWheelEvent interface."
  },
  "onmouseup": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onmouseup",
    "!doc": "An event handler for the mouseup event on the window."
  },
  "onmouseover": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseover",
    "!doc": "The onmouseover property returns the onMouseOver event handler code on the current element."
  },
  "onmouseout": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmouseout",
    "!doc": "The onmouseout property returns the onMouseOut event handler code on the current element."
  },
  "onmousemove": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onmousemove",
    "!doc": "The onmousemove property returns the mousemove event handler code on the current element."
  },
  "onmousedown": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onmousedown",
    "!doc": "An event handler for the mousedown event on the window."
  },
  "onclick": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onclick",
    "!doc": "The onclick property returns the onClick event handler code on the current element."
  },
  "ondblclick": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.ondblclick",
    "!doc": "The ondblclick property returns the onDblClick event handler code on the current element."
  },
  "onmessage": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/Worker",
    "!doc": "Dedicated Web Workers provide a simple means for web content to run scripts in background threads.  Once created, a worker can send messages to the spawning task by posting messages to an event handler specified by the creator."
  },
  "onkeyup": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeyup",
    "!doc": "The onkeyup property returns the onKeyUp event handler code for the current element."
  },
  "onkeypress": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onkeypress",
    "!doc": "The onkeypress property sets and returns the onKeyPress event handler code for the current element."
  },
  "onkeydown": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onkeydown",
    "!doc": "An event handler for the keydown event on the window."
  },
  "oninput": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/DOM_event_reference/input",
    "!doc": "The DOM input event is fired synchronously when the value of an <input> or <textarea> element is changed. Additionally, it's also fired on contenteditable editors when its contents are changed. In this case, the event target is the editing host element. If there are two or more elements which have contenteditable as true, \"editing host\" is the nearest ancestor element whose parent isn't editable. Similarly, it's also fired on root element of designMode editors."
  },
  "onpopstate": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onpopstate",
    "!doc": "An event handler for the popstate event on the window."
  },
  "onhashchange": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onhashchange",
    "!doc": "The hashchange event fires when a window's hash changes."
  },
  "onfocus": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onfocus",
    "!doc": "The onfocus property returns the onFocus event handler code on the current element."
  },
  "onblur": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onblur",
    "!doc": "The onblur property returns the onBlur event handler code, if any, that exists on the current element."
  },
  "onerror": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onerror",
    "!doc": "An event handler for runtime script errors."
  },
  "ondrop": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/drop",
    "!doc": "The drop event is fired when an element or text selection is dropped on a valid drop target."
  },
  "ondragstart": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragstart",
    "!doc": "The dragstart event is fired when the user starts dragging an element or text selection."
  },
  "ondragover": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragover",
    "!doc": "The dragover event is fired when an element or text selection is being dragged over a valid drop target (every few hundred milliseconds)."
  },
  "ondragleave": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragleave",
    "!doc": "The dragleave event is fired when a dragged element or text selection leaves a valid drop target."
  },
  "ondragenter": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragenter",
    "!doc": "The dragenter event is fired when a dragged element or text selection enters a valid drop target."
  },
  "ondragend": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/dragend",
    "!doc": "The dragend event is fired when a drag operation is being ended (by releasing a mouse button or hitting the escape key)."
  },
  "ondrag": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/drag",
    "!doc": "The drag event is fired when an element or text selection is being dragged (every few hundred milliseconds)."
  },
  "oncontextmenu": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.oncontextmenu",
    "!doc": "An event handler property for right-click events on the window. Unless the default behavior is prevented, the browser context menu will activate (though IE8 has a bug with this and will not activate the context menu if a contextmenu event handler is defined). Note that this event will occur with any non-disabled right-click event and does not depend on an element possessing the \"contextmenu\" attribute."
  },
  "onchange": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/element.onchange",
    "!doc": "The onchange property sets and returns the onChange event handler code for the current element."
  },
  "onbeforeunload": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onbeforeunload",
    "!doc": "An event that fires when a window is about to unload its resources. The document is still visible and the event is still cancelable."
  },
  "onabort": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.onabort",
    "!doc": "An event handler for abort events sent to the window."
  },
  "getSelection": {
    "!type": "fn() -> +Selection",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.getSelection",
    "!doc": "Returns a selection object representing the range of text selected by the user. "
  },
  "alert": {
    "!type": "fn(message: string)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.alert",
    "!doc": "Display an alert dialog with the specified content and an OK button."
  },
  "confirm": {
    "!type": "fn(message: string) -> bool",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.confirm",
    "!doc": "Displays a modal dialog with a message and two buttons, OK and Cancel."
  },
  "prompt": {
    "!type": "fn(message: string, value: string) -> string",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.prompt",
    "!doc": "Displays a dialog with a message prompting the user to input some text."
  },
  "scrollBy": {
    "!type": "fn(x: number, y: number)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollBy",
    "!doc": "Scrolls the document in the window by the given amount."
  },
  "scrollTo": {
    "!type": "fn(x: number, y: number)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scrollTo",
    "!doc": "Scrolls to a particular set of coordinates in the document."
  },
  "scroll": {
    "!type": "fn(x: number, y: number)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.scroll",
    "!doc": "Scrolls the window to a particular place in the document."
  },
  "setTimeout": {
    "!type": "fn(f: fn(), ms: number) -> number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.setTimeout",
    "!doc": "Calls a function or executes a code snippet after specified delay."
  },
  "clearTimeout": {
    "!type": "fn(timeout: number)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.clearTimeout",
    "!doc": "Clears the delay set by window.setTimeout()."
  },
  "setInterval": {
    "!type": "fn(f: fn(), ms: number) -> number",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.setInterval",
    "!doc": "Calls a function or executes a code snippet repeatedly, with a fixed time delay between each call to that function."
  },
  "clearInterval": {
    "!type": "fn(interval: number)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.clearInterval",
    "!doc": "Cancels repeated action which was set up using setInterval."
  },
  "atob": {
    "!type": "fn(encoded: string) -> string",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.atob",
    "!doc": "Decodes a string of data which has been encoded using base-64 encoding."
  },
  "btoa": {
    "!type": "fn(data: string) -> string",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.btoa",
    "!doc": "Creates a base-64 encoded ASCII string from a string of binary data."
  },
  "addEventListener": {
    "!type": "fn(type: string, listener: fn(e: +Event), capture: bool)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.addEventListener",
    "!doc": "Registers a single event listener on a single target. The event target may be a single element in a document, the document itself, a window, or an XMLHttpRequest."
  },
  "removeEventListener": {
    "!type": "fn(type: string, listener: fn(), capture: bool)",
    "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.removeEventListener",
    "!doc": "Allows the removal of event listeners from the event target."
  },
  "dispatchEvent": {
    "!type": "fn(event: +Event) -> bool",
    "!url": "https://developer.mozilla.org/en/docs/DOM/EventTarget.dispatchEvent",
    "!doc": "Dispatches an event into the event system. The event is subject to the same capturing and bubbling behavior as directly dispatched events."
  },
  "getComputedStyle": {
    "!type": "fn(node: +Element, pseudo?: string) -> Element.prototype.style",
    "!url": "https://developer.mozilla.org/en/docs/DOM/window.getComputedStyle",
    "!doc": "Gives the final used values of all the CSS properties of an element."
  },
  "CanvasRenderingContext2D": {
    "canvas": "+Element",
    "width": "number",
    "height": "number",
    "commit": "fn()",
    "save": "fn()",
    "restore": "fn()",
    "currentTransform": "?",
    "scale": "fn(x: number, y: number)",
    "rotate": "fn(angle: number)",
    "translate": "fn(x: number, y: number)",
    "transform": "fn(a: number, b: number, c: number, d: number, e: number, f: number)",
    "setTransform": "fn(a: number, b: number, c: number, d: number, e: number, f: number)",
    "resetTransform": "fn()",
    "globalAlpha": "number",
    "globalCompositeOperation": "string",
    "imageSmoothingEnabled": "bool",
    "strokeStyle": "string",
    "fillStyle": "string",
    "createLinearGradient": "fn(x0: number, y0: number, x1: number, y1: number) -> ?",
    "createPattern": "fn(image: ?, repetition: string) -> ?",
    "shadowOffsetX": "number",
    "shadowOffsetY": "number",
    "shadowBlur": "number",
    "shadowColor": "string",
    "clearRect": "fn(x: number, y: number, w: number, h: number)",
    "fillRect": "fn(x: number, y: number, w: number, h: number)",
    "strokeRect": "fn(x: number, y: number, w: number, h: number)",
    "fillRule": "string",
    "fill": "fn()",
    "beginPath": "fn()",
    "stroke": "fn()",
    "clip": "fn()",
    "resetClip": "fn()",
    "fillText": "fn(text: string, x: number, y: number, maxWidth: number)",
    "strokeText": "fn(text: string, x: number, y: number, maxWidth: number)",
    "measureText": "fn(text: string) -> ?",
    "drawImage": "fn(image: ?, dx: number, dy: number)",
    "createImageData": "fn(sw: number, sh: number) -> ?",
    "getImageData": "fn(sx: number, sy: number, sw: number, sh: number) -> ?",
    "putImageData": "fn(imagedata: ?, dx: number, dy: number)",
    "lineWidth": "number",
    "lineCap": "string",
    "lineJoin": "string",
    "miterLimit": "number",
    "setLineDash": "fn(segments: [number])",
    "getLineDash": "fn() -> [number]",
    "lineDashOffset": "number",
    "font": "string",
    "textAlign": "string",
    "textBaseline": "string",
    "direction": "string",
    "closePath": "fn()",
    "moveTo": "fn(x: number, y: number)",
    "lineTo": "fn(x: number, y: number)",
    "quadraticCurveTo": "fn(cpx: number, cpy: number, x: number, y: number)",
    "bezierCurveTo": "fn(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number)",
    "arcTo": "fn(x1: number, y1: number, x2: number, y2: number, radius: number)",
    "rect": "fn(x: number, y: number, w: number, h: number)",
    "arc": "fn(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: bool)",
    "ellipse": "fn(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise: bool)"
  }
};

//#endregion


//#region tern/defs/ecma5.json

var def_ecma5 = {
  "!name": "ecma5",
  "!define": {"Error.prototype": "Error.prototype"},
  "Infinity": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Infinity",
    "!doc": "A numeric value representing infinity."
  },
  "undefined": {
    "!type": "?",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/undefined",
    "!doc": "The value undefined."
  },
  "NaN": {
    "!type": "number",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/NaN",
    "!doc": "A value representing Not-A-Number."
  },
  "Object": {
    "!type": "fn()",
    "getPrototypeOf": {
      "!type": "fn(obj: ?) -> ?",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/getPrototypeOf",
      "!doc": "Returns the prototype (i.e. the internal prototype) of the specified object."
    },
    "create": {
      "!type": "fn(proto: ?) -> !custom:Object_create",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/create",
      "!doc": "Creates a new object with the specified prototype object and properties."
    },
    "defineProperty": {
      "!type": "fn(obj: ?, prop: string, desc: ?) -> !custom:Object_defineProperty",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/defineProperty",
      "!doc": "Defines a new property directly on an object, or modifies an existing property on an object, and returns the object. If you want to see how to use the Object.defineProperty method with a binary-flags-like syntax, see this article."
    },
    "defineProperties": {
      "!type": "fn(obj: ?, props: ?)",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/defineProperty",
      "!doc": "Defines a new property directly on an object, or modifies an existing property on an object, and returns the object. If you want to see how to use the Object.defineProperty method with a binary-flags-like syntax, see this article."
    },
    "getOwnPropertyDescriptor": {
      "!type": "fn(obj: ?, prop: string) -> ?",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor",
      "!doc": "Returns a property descriptor for an own property (that is, one directly present on an object, not present by dint of being along an object's prototype chain) of a given object."
    },
    "keys": {
      "!type": "fn(obj: ?) -> [string]",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/keys",
      "!doc": "Returns an array of a given object's own enumerable properties, in the same order as that provided by a for-in loop (the difference being that a for-in loop enumerates properties in the prototype chain as well)."
    },
    "getOwnPropertyNames": {
      "!type": "fn(obj: ?) -> [string]",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/getOwnPropertyNames",
      "!doc": "Returns an array of all properties (enumerable or not) found directly upon a given object."
    },
    "seal": {
      "!type": "fn(obj: ?)",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/seal",
      "!doc": "Seals an object, preventing new properties from being added to it and marking all existing properties as non-configurable. Values of present properties can still be changed as long as they are writable."
    },
    "isSealed": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/isSealed",
      "!doc": "Determine if an object is sealed."
    },
    "freeze": {
      "!type": "fn(obj: ?)",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/freeze",
      "!doc": "Freezes an object: that is, prevents new properties from being added to it; prevents existing properties from being removed; and prevents existing properties, or their enumerability, configurability, or writability, from being changed. In essence the object is made effectively immutable. The method returns the object being frozen."
    },
    "isFrozen": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/isFrozen",
      "!doc": "Determine if an object is frozen."
    },
    "preventExtensions": {
      "!type": "fn(obj: ?)",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/preventExtensions",
      "!doc": "Prevents new properties from ever being added to an object."
    },
    "isExtensible": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isExtensible",
      "!doc": "The Object.isExtensible() method determines if an object is extensible (whether it can have new properties added to it)."
    },
    "prototype": {
      "!stdProto": "Object",
      "toString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/toString",
        "!doc": "Returns a string representing the object."
      },
      "toLocaleString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/toLocaleString",
        "!doc": "Returns a string representing the object. This method is meant to be overriden by derived objects for locale-specific purposes."
      },
      "valueOf": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/valueOf",
        "!doc": "Returns the primitive value of the specified object"
      },
      "hasOwnProperty": {
        "!type": "fn(prop: string) -> bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/hasOwnProperty",
        "!doc": "Returns a boolean indicating whether the object has the specified property."
      },
      "propertyIsEnumerable": {
        "!type": "fn(prop: string) -> bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/propertyIsEnumerable",
        "!doc": "Returns a Boolean indicating whether the specified property is enumerable."
      },
      "isPrototypeOf": {
        "!type": "fn(obj: ?) -> bool",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/isPrototypeOf",
        "!doc": "Tests for an object in another object's prototype chain."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object",
    "!doc": "Creates an object wrapper."
  },
  "Function": {
    "!type": "fn(body: string) -> fn()",
    "prototype": {
      "!stdProto": "Function",
      "apply": {
        "!type": "fn(this: ?, args: [?])",
        "!effects": [
          "call and return !this this=!0 !1.<i> !1.<i> !1.<i>"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/apply",
        "!doc": "Calls a function with a given this value and arguments provided as an array (or an array like object)."
      },
      "call": {
        "!type": "fn(this: ?, args?: ?) -> !this.!ret",
        "!effects": [
          "call and return !this this=!0 !1 !2 !3 !4"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/call",
        "!doc": "Calls a function with a given this value and arguments provided individually."
      },
      "bind": {
        "!type": "fn(this: ?, args?: ?) -> !custom:Function_bind",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function/bind",
        "!doc": "Creates a new function that, when called, has its this keyword set to the provided value, with a given sequence of arguments preceding any provided when the new function was called."
      },
      "prototype": "?"
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Function",
    "!doc": "Every function in JavaScript is actually a Function object."
  },
  "Array": {
    "!type": "fn(size: number) -> !custom:Array_ctor",
    "isArray": {
      "!type": "fn(value: ?) -> bool",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/isArray",
      "!doc": "Returns true if an object is an array, false if it is not."
    },
    "prototype": {
      "!stdProto": "Array",
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/length",
        "!doc": "An unsigned, 32-bit integer that specifies the number of elements in an array."
      },
      "concat": {
        "!type": "fn(other: [?]) -> !this",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/concat",
        "!doc": "Returns a new array comprised of this array joined with other array(s) and/or value(s)."
      },
      "join": {
        "!type": "fn(separator?: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/join",
        "!doc": "Joins all elements of an array into a string."
      },
      "splice": {
        "!type": "fn(pos: number, amount: number)",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/splice",
        "!doc": "Changes the content of an array, adding new elements while removing old elements."
      },
      "pop": {
        "!type": "fn() -> !this.<i>",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/pop",
        "!doc": "Removes the last element from an array and returns that element."
      },
      "push": {
        "!type": "fn(newelt: ?) -> number",
        "!effects": [
          "propagate !0 !this.<i>"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/push",
        "!doc": "Mutates an array by appending the given elements and returning the new length of the array."
      },
      "shift": {
        "!type": "fn() -> !this.<i>",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/shift",
        "!doc": "Removes the first element from an array and returns that element. This method changes the length of the array."
      },
      "unshift": {
        "!type": "fn(newelt: ?) -> number",
        "!effects": [
          "propagate !0 !this.<i>"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/unshift",
        "!doc": "Adds one or more elements to the beginning of an array and returns the new length of the array."
      },
      "slice": {
        "!type": "fn(from: number, to?: number) -> !this",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/slice",
        "!doc": "Returns a shallow copy of a portion of an array."
      },
      "reverse": {
        "!type": "fn()",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/reverse",
        "!doc": "Reverses an array in place.  The first array element becomes the last and the last becomes the first."
      },
      "sort": {
        "!type": "fn(compare?: fn(a: ?, b: ?) -> number)",
        "!effects": [
          "call !0 !this.<i> !this.<i>"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort",
        "!doc": "Sorts the elements of an array in place and returns the array."
      },
      "indexOf": {
        "!type": "fn(elt: ?, from?: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/indexOf",
        "!doc": "Returns the first index at which a given element can be found in the array, or -1 if it is not present."
      },
      "lastIndexOf": {
        "!type": "fn(elt: ?, from?: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/lastIndexOf",
        "!doc": "Returns the last index at which a given element can be found in the array, or -1 if it is not present. The array is searched backwards, starting at fromIndex."
      },
      "every": {
        "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/every",
        "!doc": "Tests whether all elements in the array pass the test implemented by the provided function."
      },
      "some": {
        "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/some",
        "!doc": "Tests whether some element in the array passes the test implemented by the provided function."
      },
      "filter": {
        "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> !this",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/filter",
        "!doc": "Creates a new array with all elements that pass the test implemented by the provided function."
      },
      "forEach": {
        "!type": "fn(f: fn(elt: ?, i: number), context?: ?)",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/forEach",
        "!doc": "Executes a provided function once per array element."
      },
      "map": {
        "!type": "fn(f: fn(elt: ?, i: number) -> ?, context?: ?) -> [!0.!ret]",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/map",
        "!doc": "Creates a new array with the results of calling a provided function on every element in this array."
      },
      "reduce": {
        "!type": "fn(combine: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?) -> !0.!ret",
        "!effects": [
          "call !0 !1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/Reduce",
        "!doc": "Apply a function against an accumulator and each value of the array (from left-to-right) as to reduce it to a single value."
      },
      "reduceRight": {
        "!type": "fn(combine: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?) -> !0.!ret",
        "!effects": [
          "call !0 !1 !this.<i> number"
        ],
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/ReduceRight",
        "!doc": "Apply a function simultaneously against two values of the array (from right-to-left) as to reduce it to a single value."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array",
    "!doc": "The JavaScript Array global object is a constructor for arrays, which are high-level, list-like objects."
  },
  "String": {
    "!type": "fn(value: ?) -> string",
    "fromCharCode": {
      "!type": "fn(code: number) -> string",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/fromCharCode",
      "!doc": "Returns a string created by using the specified sequence of Unicode values."
    },
    "prototype": {
      "!stdProto": "String",
      "length": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en/docs/JavaScript/Reference/Global_Objects/String/length",
        "!doc": "Represents the length of a string."
      },
      "<i>": "string",
      "charAt": {
        "!type": "fn(i: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/charAt",
        "!doc": "Returns the specified character from a string."
      },
      "charCodeAt": {
        "!type": "fn(i: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/charCodeAt",
        "!doc": "Returns the numeric Unicode value of the character at the given index (except for unicode codepoints > 0x10000)."
      },
      "indexOf": {
        "!type": "fn(char: string, from?: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/indexOf",
        "!doc": "Returns the index within the calling String object of the first occurrence of the specified value, starting the search at fromIndex,\nreturns -1 if the value is not found."
      },
      "lastIndexOf": {
        "!type": "fn(char: string, from?: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/lastIndexOf",
        "!doc": "Returns the index within the calling String object of the last occurrence of the specified value, or -1 if not found. The calling string is searched backward, starting at fromIndex."
      },
      "substring": {
        "!type": "fn(from: number, to?: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/substring",
        "!doc": "Returns a subset of a string between one index and another, or through the end of the string."
      },
      "substr": {
        "!type": "fn(from: number, length?: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/substr",
        "!doc": "Returns the characters in a string beginning at the specified location through the specified number of characters."
      },
      "slice": {
        "!type": "fn(from: number, to?: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/slice",
        "!doc": "Extracts a section of a string and returns a new string."
      },
      "trim": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/Trim",
        "!doc": "Removes whitespace from both ends of the string."
      },
      "toUpperCase": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toUpperCase",
        "!doc": "Returns the calling string value converted to uppercase."
      },
      "toLowerCase": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toLowerCase",
        "!doc": "Returns the calling string value converted to lowercase."
      },
      "toLocaleUpperCase": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toLocaleUpperCase",
        "!doc": "Returns the calling string value converted to upper case, according to any locale-specific case mappings."
      },
      "toLocaleLowerCase": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/toLocaleLowerCase",
        "!doc": "Returns the calling string value converted to lower case, according to any locale-specific case mappings."
      },
      "split": {
        "!type": "fn(pattern: string) -> [string]",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/split",
        "!doc": "Splits a String object into an array of strings by separating the string into substrings."
      },
      "concat": {
        "!type": "fn(other: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/concat",
        "!doc": "Combines the text of two or more strings and returns a new string."
      },
      "localeCompare": {
        "!type": "fn(other: string) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/localeCompare",
        "!doc": "Returns a number indicating whether a reference string comes before or after or is the same as the given string in sort order."
      },
      "match": {
        "!type": "fn(pattern: +RegExp) -> [string]",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/match",
        "!doc": "Used to retrieve the matches when matching a string against a regular expression."
      },
      "replace": {
        "!type": "fn(pattern: +RegExp, replacement: string) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/replace",
        "!doc": "Returns a new string with some or all matches of a pattern replaced by a replacement.  The pattern can be a string or a RegExp, and the replacement can be a string or a function to be called for each match."
      },
      "search": {
        "!type": "fn(pattern: +RegExp) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/search",
        "!doc": "Executes the search for a match between a regular expression and this String object."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String",
    "!doc": "The String global object is a constructor for strings, or a sequence of characters."
  },
  "Number": {
    "!type": "fn(value: ?) -> number",
    "MAX_VALUE": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/MAX_VALUE",
      "!doc": "The maximum numeric value representable in JavaScript."
    },
    "MIN_VALUE": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/MIN_VALUE",
      "!doc": "The smallest positive numeric value representable in JavaScript."
    },
    "POSITIVE_INFINITY": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/POSITIVE_INFINITY",
      "!doc": "A value representing the positive Infinity value."
    },
    "NEGATIVE_INFINITY": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/NEGATIVE_INFINITY",
      "!doc": "A value representing the negative Infinity value."
    },
    "prototype": {
      "!stdProto": "Number",
      "toString": {
        "!type": "fn(radix?: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toString",
        "!doc": "Returns a string representing the specified Number object"
      },
      "toFixed": {
        "!type": "fn(digits: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toFixed",
        "!doc": "Formats a number using fixed-point notation"
      },
      "toExponential": {
        "!type": "fn(digits: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toExponential",
        "!doc": "Returns a string representing the Number object in exponential notation"
      },
      "toPrecision": {
        "!type": "fn(digits: number) -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number/toPrecision",
        "!doc": "The toPrecision() method returns a string representing the number to the specified precision."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Number",
    "!doc": "The Number JavaScript object is a wrapper object allowing you to work with numerical values. A Number object is created using the Number() constructor."
  },
  "Boolean": {
    "!type": "fn(value: ?) -> bool",
    "prototype": {
      "!stdProto": "Boolean"
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Boolean",
    "!doc": "The Boolean object is an object wrapper for a boolean value."
  },
  "RegExp": {
    "!type": "fn(source: string, flags?: string)",
    "prototype": {
      "!stdProto": "RegExp",
      "exec": {
        "!type": "fn(input: string) -> [string]",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/exec",
        "!doc": "Executes a search for a match in a specified string. Returns a result array, or null."
      },
      "test": {
        "!type": "fn(input: string) -> bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/test",
        "!doc": "Executes the search for a match between a regular expression and a specified string. Returns true or false."
      },
      "global": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
        "!doc": "Creates a regular expression object for matching text with a pattern."
      },
      "ignoreCase": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
        "!doc": "Creates a regular expression object for matching text with a pattern."
      },
      "multiline": {
        "!type": "bool",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/multiline",
        "!doc": "Reflects whether or not to search in strings across multiple lines.\n"
      },
      "source": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/source",
        "!doc": "A read-only property that contains the text of the pattern, excluding the forward slashes.\n"
      },
      "lastIndex": {
        "!type": "number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp/lastIndex",
        "!doc": "A read/write integer property that specifies the index at which to start the next match."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RegExp",
    "!doc": "Creates a regular expression object for matching text with a pattern."
  },
  "Date": {
    "!type": "fn(ms: number)",
    "parse": {
      "!type": "fn(source: string) -> +Date",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/parse",
      "!doc": "Parses a string representation of a date, and returns the number of milliseconds since January 1, 1970, 00:00:00 UTC."
    },
    "UTC": {
      "!type": "fn(year: number, month: number, date: number, hour?: number, min?: number, sec?: number, ms?: number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/UTC",
      "!doc": "Accepts the same parameters as the longest form of the constructor, and returns the number of milliseconds in a Date object since January 1, 1970, 00:00:00, universal time."
    },
    "now": {
      "!type": "fn() -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/now",
      "!doc": "Returns the number of milliseconds elapsed since 1 January 1970 00:00:00 UTC."
    },
    "prototype": {
      "toUTCString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toUTCString",
        "!doc": "Converts a date to a string, using the universal time convention."
      },
      "toISOString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toISOString",
        "!doc": "JavaScript provides a direct way to convert a date object into a string in ISO format, the ISO 8601 Extended Format."
      },
      "toDateString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toDateString",
        "!doc": "Returns the date portion of a Date object in human readable form in American English."
      },
      "toTimeString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toTimeString",
        "!doc": "Returns the time portion of a Date object in human readable form in American English."
      },
      "toLocaleDateString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toLocaleDateString",
        "!doc": "Converts a date to a string, returning the \"date\" portion using the operating system's locale's conventions.\n"
      },
      "toLocaleTimeString": {
        "!type": "fn() -> string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/toLocaleTimeString",
        "!doc": "Converts a date to a string, returning the \"time\" portion using the current locale's conventions."
      },
      "getTime": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getTime",
        "!doc": "Returns the numeric value corresponding to the time for the specified date according to universal time."
      },
      "getFullYear": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getFullYear",
        "!doc": "Returns the year of the specified date according to local time."
      },
      "getYear": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getYear",
        "!doc": "Returns the year in the specified date according to local time."
      },
      "getMonth": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getMonth",
        "!doc": "Returns the month in the specified date according to local time."
      },
      "getUTCMonth": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCMonth",
        "!doc": "Returns the month of the specified date according to universal time.\n"
      },
      "getDate": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getDate",
        "!doc": "Returns the day of the month for the specified date according to local time."
      },
      "getUTCDate": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCDate",
        "!doc": "Returns the day (date) of the month in the specified date according to universal time.\n"
      },
      "getDay": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getDay",
        "!doc": "Returns the day of the week for the specified date according to local time."
      },
      "getUTCDay": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCDay",
        "!doc": "Returns the day of the week in the specified date according to universal time.\n"
      },
      "getHours": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getHours",
        "!doc": "Returns the hour for the specified date according to local time."
      },
      "getUTCHours": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCHours",
        "!doc": "Returns the hours in the specified date according to universal time.\n"
      },
      "getMinutes": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getMinutes",
        "!doc": "Returns the minutes in the specified date according to local time."
      },
      "getUTCMinutes": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date",
        "!doc": "Creates JavaScript Date instances which let you work with dates and times."
      },
      "getSeconds": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getSeconds",
        "!doc": "Returns the seconds in the specified date according to local time."
      },
      "getUTCSeconds": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCSeconds",
        "!doc": "Returns the seconds in the specified date according to universal time.\n"
      },
      "getMilliseconds": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getMilliseconds",
        "!doc": "Returns the milliseconds in the specified date according to local time."
      },
      "getUTCMilliseconds": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getUTCMilliseconds",
        "!doc": "Returns the milliseconds in the specified date according to universal time.\n"
      },
      "getTimezoneOffset": {
        "!type": "fn() -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset",
        "!doc": "Returns the time-zone offset from UTC, in minutes, for the current locale."
      },
      "setTime": {
        "!type": "fn(date: +Date) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setTime",
        "!doc": "Sets the Date object to the time represented by a number of milliseconds since January 1, 1970, 00:00:00 UTC.\n"
      },
      "setFullYear": {
        "!type": "fn(year: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setFullYear",
        "!doc": "Sets the full year for a specified date according to local time.\n"
      },
      "setUTCFullYear": {
        "!type": "fn(year: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCFullYear",
        "!doc": "Sets the full year for a specified date according to universal time.\n"
      },
      "setMonth": {
        "!type": "fn(month: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setMonth",
        "!doc": "Set the month for a specified date according to local time."
      },
      "setUTCMonth": {
        "!type": "fn(month: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCMonth",
        "!doc": "Sets the month for a specified date according to universal time.\n"
      },
      "setDate": {
        "!type": "fn(day: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setDate",
        "!doc": "Sets the day of the month for a specified date according to local time."
      },
      "setUTCDate": {
        "!type": "fn(day: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCDate",
        "!doc": "Sets the day of the month for a specified date according to universal time.\n"
      },
      "setHours": {
        "!type": "fn(hour: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setHours",
        "!doc": "Sets the hours for a specified date according to local time, and returns the number of milliseconds since 1 January 1970 00:00:00 UTC until the time represented by the updated Date instance."
      },
      "setUTCHours": {
        "!type": "fn(hour: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCHours",
        "!doc": "Sets the hour for a specified date according to universal time.\n"
      },
      "setMinutes": {
        "!type": "fn(min: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setMinutes",
        "!doc": "Sets the minutes for a specified date according to local time."
      },
      "setUTCMinutes": {
        "!type": "fn(min: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCMinutes",
        "!doc": "Sets the minutes for a specified date according to universal time.\n"
      },
      "setSeconds": {
        "!type": "fn(sec: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setSeconds",
        "!doc": "Sets the seconds for a specified date according to local time."
      },
      "setUTCSeconds": {
        "!type": "fn(sec: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCSeconds",
        "!doc": "Sets the seconds for a specified date according to universal time.\n"
      },
      "setMilliseconds": {
        "!type": "fn(ms: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setMilliseconds",
        "!doc": "Sets the milliseconds for a specified date according to local time.\n"
      },
      "setUTCMilliseconds": {
        "!type": "fn(ms: number) -> number",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date/setUTCMilliseconds",
        "!doc": "Sets the milliseconds for a specified date according to universal time.\n"
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Date",
    "!doc": "Creates JavaScript Date instances which let you work with dates and times."
  },
  "Error": {
    "!type": "fn(message: string)",
    "prototype": {
      "name": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Error/name",
        "!doc": "A name for the type of error."
      },
      "message": {
        "!type": "string",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Error/message",
        "!doc": "A human-readable description of the error."
      }
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Error",
    "!doc": "Creates an error object."
  },
  "SyntaxError": {
    "!type": "fn(message: string)",
    "prototype": "Error.prototype",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/SyntaxError",
    "!doc": "Represents an error when trying to interpret syntactically invalid code."
  },
  "ReferenceError": {
    "!type": "fn(message: string)",
    "prototype": "Error.prototype",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/ReferenceError",
    "!doc": "Represents an error when a non-existent variable is referenced."
  },
  "URIError": {
    "!type": "fn(message: string)",
    "prototype": "Error.prototype",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/URIError",
    "!doc": "Represents an error when a malformed URI is encountered."
  },
  "EvalError": {
    "!type": "fn(message: string)",
    "prototype": "Error.prototype",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/EvalError",
    "!doc": "Represents an error regarding the eval function."
  },
  "RangeError": {
    "!type": "fn(message: string)",
    "prototype": "Error.prototype",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/RangeError",
    "!doc": "Represents an error when a number is not within the correct range allowed."
  },
  "TypeError": {
    "!type": "fn(message: string)",
    "prototype": "Error.prototype",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/TypeError",
    "!doc": "Represents an error an error when a value is not of the expected type."
  },
  "parseInt": {
    "!type": "fn(string: string, radix?: number) -> number",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/parseInt",
    "!doc": "Parses a string argument and returns an integer of the specified radix or base."
  },
  "parseFloat": {
    "!type": "fn(string: string) -> number",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/parseFloat",
    "!doc": "Parses a string argument and returns a floating point number."
  },
  "isNaN": {
    "!type": "fn(value: number) -> bool",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/isNaN",
    "!doc": "Determines whether a value is NaN or not. Be careful, this function is broken. You may be interested in ECMAScript 6 Number.isNaN."
  },
  "isFinite": {
    "!type": "fn(value: number) -> bool",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/isFinite",
    "!doc": "Determines whether the passed value is a finite number."
  },
  "eval": {
    "!type": "fn(code: string) -> ?",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/eval",
    "!doc": "Evaluates JavaScript code represented as a string."
  },
  "encodeURI": {
    "!type": "fn(uri: string) -> string",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/encodeURI",
    "!doc": "Encodes a Uniform Resource Identifier (URI) by replacing each instance of certain characters by one, two, three, or four escape sequences representing the UTF-8 encoding of the character (will only be four escape sequences for characters composed of two \"surrogate\" characters)."
  },
  "encodeURIComponent": {
    "!type": "fn(uri: string) -> string",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/encodeURIComponent",
    "!doc": "Encodes a Uniform Resource Identifier (URI) component by replacing each instance of certain characters by one, two, three, or four escape sequences representing the UTF-8 encoding of the character (will only be four escape sequences for characters composed of two \"surrogate\" characters)."
  },
  "decodeURI": {
    "!type": "fn(uri: string) -> string",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/decodeURI",
    "!doc": "Decodes a Uniform Resource Identifier (URI) previously created by encodeURI or by a similar routine."
  },
  "decodeURIComponent": {
    "!type": "fn(uri: string) -> string",
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/decodeURIComponent",
    "!doc": "Decodes a Uniform Resource Identifier (URI) component previously created by encodeURIComponent or by a similar routine."
  },
  "Math": {
    "E": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/E",
      "!doc": "The base of natural logarithms, e, approximately 2.718."
    },
    "LN2": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LN2",
      "!doc": "The natural logarithm of 2, approximately 0.693."
    },
    "LN10": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LN10",
      "!doc": "The natural logarithm of 10, approximately 2.302."
    },
    "LOG2E": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LOG2E",
      "!doc": "The base 2 logarithm of E (approximately 1.442)."
    },
    "LOG10E": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/LOG10E",
      "!doc": "The base 10 logarithm of E (approximately 0.434)."
    },
    "SQRT1_2": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/SQRT1_2",
      "!doc": "The square root of 1/2; equivalently, 1 over the square root of 2, approximately 0.707."
    },
    "SQRT2": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/SQRT2",
      "!doc": "The square root of 2, approximately 1.414."
    },
    "PI": {
      "!type": "number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/PI",
      "!doc": "The ratio of the circumference of a circle to its diameter, approximately 3.14159."
    },
    "abs": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/abs",
      "!doc": "Returns the absolute value of a number."
    },
    "cos": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/cos",
      "!doc": "Returns the cosine of a number."
    },
    "sin": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/sin",
      "!doc": "Returns the sine of a number."
    },
    "tan": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/tan",
      "!doc": "Returns the tangent of a number."
    },
    "acos": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/acos",
      "!doc": "Returns the arccosine (in radians) of a number."
    },
    "asin": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/asin",
      "!doc": "Returns the arcsine (in radians) of a number."
    },
    "atan": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/atan",
      "!doc": "Returns the arctangent (in radians) of a number."
    },
    "atan2": {
      "!type": "fn(y: number, x: number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/atan2",
      "!doc": "Returns the arctangent of the quotient of its arguments."
    },
    "ceil": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/ceil",
      "!doc": "Returns the smallest integer greater than or equal to a number."
    },
    "floor": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/floor",
      "!doc": "Returns the largest integer less than or equal to a number."
    },
    "round": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/round",
      "!doc": "Returns the value of a number rounded to the nearest integer."
    },
    "exp": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/exp",
      "!doc": "Returns Ex, where x is the argument, and E is Euler's constant, the base of the natural logarithms."
    },
    "log": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/log",
      "!doc": "Returns the natural logarithm (base E) of a number."
    },
    "sqrt": {
      "!type": "fn(number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/sqrt",
      "!doc": "Returns the square root of a number."
    },
    "pow": {
      "!type": "fn(number, number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/pow",
      "!doc": "Returns base to the exponent power, that is, baseexponent."
    },
    "max": {
      "!type": "fn(number, number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/max",
      "!doc": "Returns the largest of zero or more numbers."
    },
    "min": {
      "!type": "fn(number, number) -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/min",
      "!doc": "Returns the smallest of zero or more numbers."
    },
    "random": {
      "!type": "fn() -> number",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/random",
      "!doc": "Returns a floating-point, pseudo-random number in the range [0, 1) that is, from 0 (inclusive) up to but not including 1 (exclusive), which you can then scale to your desired range."
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math",
    "!doc": "A built-in object that has properties and methods for mathematical constants and functions."
  },
  "JSON": {
    "parse": {
      "!type": "fn(json: string) -> ?",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/JSON/parse",
      "!doc": "Parse a string as JSON, optionally transforming the value produced by parsing."
    },
    "stringify": {
      "!type": "fn(value: ?) -> string",
      "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/JSON/stringify",
      "!doc": "Convert a value to JSON, optionally replacing values if a replacer function is specified, or optionally including only the specified properties if a replacer array is specified."
    },
    "!url": "https://developer.mozilla.org/en-US/docs/JSON",
    "!doc": "JSON (JavaScript Object Notation) is a data-interchange format.  It closely resembles a subset of JavaScript syntax, although it is not a strict subset. (See JSON in the JavaScript Reference for full details.)  It is useful when writing any kind of JavaScript-based application, including websites and browser extensions.  For example, you might store user information in JSON format in a cookie, or you might store extension preferences in JSON in a string-valued browser preference."
  }
};

//#endregion


//#region tern/defs/jquery.json

var def_jquery = {
  "!name": "jQuery",
  "!define": {
    "offset": {
      "top": "number",
      "left": "number"
    },
    "keyvalue": {
      "name": "string",
      "value": "string"
    }
  },
  "jQuery": {
    "!type": "fn(selector: string, context?: frameElement) -> jQuery.fn",
    "!url": "http://api.jquery.com/jquery/",
    "!doc": "Return a collection of matched elements either found in the DOM based on passed argument(s) or created by passing an HTML string.",
    "fn": {
      "add": {
        "!type": "fn(selector: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/add/",
        "!doc": "Add elements to the set of matched elements."
      },
      "addBack": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/addBack/",
        "!doc": "Add the previous set of elements on the stack to the current set, optionally filtered by a selector."
      },
      "addClass": {
        "!type": "fn(className: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/addClass/",
        "!doc": "Adds the specified class(es) to each of the set of matched elements."
      },
      "after": {
        "!type": "fn(content: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/after/",
        "!doc": "Insert content, specified by the parameter, after each element in the set of matched elements."
      },
      "ajaxComplete": {
        "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
        "!url": "http://api.jquery.com/ajaxComplete/",
        "!doc": "Register a handler to be called when Ajax requests complete. This is an AjaxEvent."
      },
      "ajaxError": {
        "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
        "!url": "http://api.jquery.com/ajaxError/",
        "!doc": "Register a handler to be called when Ajax requests complete with an error. This is an Ajax Event."
      },
      "ajaxSend": {
        "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
        "!url": "http://api.jquery.com/ajaxSend/",
        "!doc": "Attach a function to be executed before an Ajax request is sent. This is an Ajax Event."
      },
      "ajaxStart": {
        "!type": "fn(handler: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/ajaxStart/",
        "!doc": "Register a handler to be called when the first Ajax request begins. This is an Ajax Event."
      },
      "ajaxStop": {
        "!type": "fn(handler: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/ajaxStop/",
        "!doc": "Register a handler to be called when all Ajax requests have completed. This is an Ajax Event."
      },
      "ajaxSuccess": {
        "!type": "fn(handler: fn(event: +jQuery.Event, req: +XMLHttpRequest)) -> jQuery.fn",
        "!url": "http://api.jquery.com/ajaxSuccess/",
        "!doc": ""
      },
      "andSelf": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/andSelf/",
        "!doc": "Attach a function to be executed whenever an Ajax request completes successfully. This is an Ajax Event."
      },
      "animate": {
        "!type": "fn(properties: ?, duration?: number, easing?: string, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/animate/",
        "!doc": "Perform a custom animation of a set of CSS properties."
      },
      "append": {
        "!type": "fn(content: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/append/",
        "!doc": "Insert content, specified by the parameter, to the end of each element in the set of matched elements."
      },
      "appendTo": {
        "!type": "fn(target: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/appendTo/",
        "!doc": "Insert every element in the set of matched elements to the end of the target."
      },
      "attr": {
        "!type": "fn(name: string, value?: string) -> string",
        "!url": "http://api.jquery.com/attr/",
        "!doc": "Get the value of an attribute for the first element in the set of matched elements or set one or more attributes for every matched element."
      },
      "before": {
        "!type": "fn(content: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/before/",
        "!doc": "Insert content, specified by the parameter, before each element in the set of matched elements."
      },
      "bind": {
        "!type": "fn(eventType: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/bind/",
        "!doc": "Attach a handler to an event for the elements."
      },
      "blur": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/blur/",
        "!doc": "Bind an event handler to the 'blur' JavaScript event, or trigger that event on an element."
      },
      "change": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/change/",
        "!doc": "Bind an event handler to the 'change' JavaScript event, or trigger that event on an element."
      },
      "children": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/children/",
        "!doc": "Get the children of each element in the set of matched elements, optionally filtered by a selector."
      },
      "click": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/click/",
        "!doc": "Bind an event handler to the 'click' JavaScript event, or trigger that event on an element."
      },
      "clone": {
        "!type": "fn(dataAndEvents?: bool, deep?: bool) -> jQuery.fn",
        "!url": "http://api.jquery.com/clone/",
        "!doc": "Create a deep copy of the set of matched elements."
      },
      "closest": {
        "!type": "fn(selector: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/closest/",
        "!doc": "For each element in the set, get the first element that matches the selector by testing the element itself and traversing up through its ancestors in the DOM tree."
      },
      "contents": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/contents/",
        "!doc": "Get the children of each element in the set of matched elements, including text and comment nodes."
      },
      "context": {
        "!type": "fn() -> +Element",
        "!url": "http://api.jquery.com/context/",
        "!doc": "The DOM node context originally passed to jQuery(); if none was passed then context will likely be the document."
      },
      "css": {
        "!type": "fn(name: string, value?: string) -> string",
        "!url": "http://api.jquery.com/css/",
        "!doc": "Get the value of a style property for the first element in the set of matched elements or set one or more CSS properties for every matched element."
      },
      "data": {
        "!type": "fn(key: string, value?: ?) -> !1",
        "!url": "http://api.jquery.com/data/",
        "!doc": "Store arbitrary data associated with the matched elements or return the value at the named data store for the first element in the set of matched elements."
      },
      "dblclick": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/dblclick/",
        "!doc": "Bind an event handler to the 'dblclick' JavaScript event, or trigger that event on an element."
      },
      "delay": {
        "!type": "fn(duration: number, queue?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/delay/",
        "!doc": "Set a timer to delay execution of subsequent items in the queue."
      },
      "delegate": {
        "!type": "fn(selector: string, eventType: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/delegate/",
        "!doc": "Attach a handler to one or more events for all elements that match the selector, now or in the future, based on a specific set of root elements."
      },
      "dequeue": {
        "!type": "fn(queue?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/dequeue/",
        "!doc": "Execute the next function on the queue for the matched elements."
      },
      "detach": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/detach/",
        "!doc": "Remove the set of matched elements from the DOM."
      },
      "die": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/die/",
        "!doc": "Remove event handlers previously attached using .live() from the elements."
      },
      "each": {
        "!type": "fn(callback: fn(i: number, element: +Element)) -> jQuery.fn",
        "!url": "http://api.jquery.com/each/",
        "!doc": "Iterate over a jQuery object, executing a function for each matched element."
      },
      "empty": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/empty/",
        "!doc": "Remove all child nodes of the set of matched elements from the DOM."
      },
      "end": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/end/",
        "!doc": "End the most recent filtering operation in the current chain and return the set of matched elements to its previous state."
      },
      "eq": {
        "!type": "fn(i: number) -> jQuery.fn",
        "!url": "http://api.jquery.com/eq/",
        "!doc": "Reduce the set of matched elements to the one at the specified index."
      },
      "error": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/error/",
        "!doc": "Bind an event handler to the 'error' JavaScript event."
      },
      "fadeIn": {
        "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/fadeIn/",
        "!doc": "Display the matched elements by fading them to opaque."
      },
      "fadeOut": {
        "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/fadeOut/",
        "!doc": "Hide the matched elements by fading them to transparent."
      },
      "fadeTo": {
        "!type": "fn(duration: number, opacity: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/fadeTo/",
        "!doc": "Adjust the opacity of the matched elements."
      },
      "fadeToggle": {
        "!type": "fn(duration?: number, easing?: string, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/fadeToggle/",
        "!doc": "Display or hide the matched elements by animating their opacity."
      },
      "filter": {
        "!type": "fn(selector: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/filter/",
        "!doc": "Reduce the set of matched elements to those that match the selector or pass the function's test."
      },
      "find": {
        "!type": "fn(selector: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/find/",
        "!doc": "Get the descendants of each element in the current set of matched elements, filtered by a selector, jQuery object, or element."
      },
      "finish": {
        "!type": "fn(queue?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/finish/",
        "!doc": "Stop the currently-running animation, remove all queued animations, and complete all animations for the matched elements."
      },
      "first": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/first/",
        "!doc": "Reduce the set of matched elements to the first in the set."
      },
      "focusin": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/focusin/",
        "!doc": "Bind an event handler to the 'focusin' event."
      },
      "focusout": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/focusout/",
        "!doc": "Bind an event handler to the 'focusout' JavaScript event."
      },
      "get": {
        "!type": "fn(i: number) -> +Element",
        "!url": "http://api.jquery.com/get/",
        "!doc": "Retrieve the DOM elements matched by the jQuery object."
      },
      "has": {
        "!type": "fn(selector: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/has/",
        "!doc": "Reduce the set of matched elements to those that have a descendant that matches the selector or DOM element."
      },
      "hasClass": {
        "!type": "fn(className: string) -> bool",
        "!url": "http://api.jquery.com/hasClass/",
        "!doc": "Determine whether any of the matched elements are assigned the given class."
      },
      "height": {
        "!type": "fn() -> number",
        "!url": "http://api.jquery.com/height/",
        "!doc": "Get the current computed height for the first element in the set of matched elements or set the height of every matched element."
      },
      "hide": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/hide/",
        "!doc": "Hide the matched elements."
      },
      "hover": {
        "!type": "fn(fnOver: fn(+jQuery.Event), fnOut?: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/hover/",
        "!doc": "Bind one or two handlers to the matched elements, to be executed when the mouse pointer enters and leaves the elements."
      },
      "html": {
        "!type": "fn() -> string",
        "!url": "http://api.jquery.com/html/",
        "!doc": "Get the HTML contents of the first element in the set of matched elements or set the HTML contents of every matched element."
      },
      "index": {
        "!type": "fn(selector?: string) -> number",
        "!url": "http://api.jquery.com/index/",
        "!doc": "Search for a given element from among the matched elements."
      },
      "innerHeight": {
        "!type": "fn() -> number",
        "!url": "http://api.jquery.com/innerHeight/",
        "!doc": "Get the current computed height for the first element in the set of matched elements, including padding but not border."
      },
      "innerWidth": {
        "!type": "fn() -> number",
        "!url": "http://api.jquery.com/innerWidth/",
        "!doc": "Get the current computed width for the first element in the set of matched elements, including padding but not border."
      },
      "insertAfter": {
        "!type": "fn(target: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/insertAfter/",
        "!doc": "Insert every element in the set of matched elements after the target."
      },
      "insertBefore": {
        "!type": "fn(target: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/insertBefore/",
        "!doc": "Insert every element in the set of matched elements before the target."
      },
      "is": {
        "!type": "fn(selector: ?) -> bool",
        "!url": "http://api.jquery.com/is/",
        "!doc": "Check the current matched set of elements against a selector, element, or jQuery object and return true if at least one of these elements matches the given arguments."
      },
      "jquery": {
        "!type": "string",
        "!url": "http://api.jquery.com/jquery-2/",
        "!doc": "A string containing the jQuery version number."
      },
      "keydown": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/keydown/",
        "!doc": "Bind an event handler to the 'keydown' JavaScript event, or trigger that event on an element."
      },
      "keypress": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/keypress/",
        "!doc": "Bind an event handler to the 'keypress' JavaScript event, or trigger that event on an element."
      },
      "keyup": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/keyup/",
        "!doc": "Bind an event handler to the 'keyup' JavaScript event, or trigger that event on an element."
      },
      "last": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/last/",
        "!doc": "Reduce the set of matched elements to the final one in the set."
      },
      "length": {
        "!type": "number",
        "!url": "http://api.jquery.com/length/",
        "!doc": "The number of elements in the jQuery object."
      },
      "live": {
        "!type": "fn(selector: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/live/",
        "!doc": "Attach an event handler for all elements which match the current selector, now and in the future."
      },
      "load": {
        "!type": "fn(handler: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/load/",
        "!doc": "Load data from the server and place the returned HTML into the matched element."
      },
      "map": {
        "!type": "fn(callback: fn(i: number, element: +Element)) -> jQuery.fn",
        "!url": "http://api.jquery.com/map/",
        "!doc": "Pass each element in the current matched set through a function, producing a new jQuery object containing the return values."
      },
      "mousedown": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mousedown/",
        "!doc": "Bind an event handler to the 'mousedown' JavaScript event, or trigger that event on an element."
      },
      "mouseenter": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mouseenter/",
        "!doc": "Bind an event handler to be fired when the mouse enters an element, or trigger that handler on an element."
      },
      "mouseleave": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mouseleave/",
        "!doc": "Bind an event handler to be fired when the mouse leaves an element, or trigger that handler on an element."
      },
      "mousemove": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mousemouve/",
        "!doc": "Bind an event handler to the 'mousemove' JavaScript event, or trigger that event on an element."
      },
      "mouseout": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mouseout/",
        "!doc": "Bind an event handler to the 'mouseout' JavaScript event, or trigger that event on an element."
      },
      "mouseover": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mouseover/",
        "!doc": "Bind an event handler to the 'mouseover' JavaScript event, or trigger that event on an element."
      },
      "mouseup": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/mouseup/",
        "!doc": "Bind an event handler to the 'mouseup' JavaScript event, or trigger that event on an element."
      },
      "next": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/next/",
        "!doc": "Get the immediately following sibling of each element in the set of matched elements. If a selector is provided, it retrieves the next sibling only if it matches that selector."
      },
      "nextAll": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/nextAll/",
        "!doc": "Get all following siblings of each element in the set of matched elements, optionally filtered by a selector."
      },
      "nextUntil": {
        "!type": "fn(selector?: string, filter?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/nextUntil/",
        "!doc": "Get all following siblings of each element up to but not including the element matched by the selector, DOM node, or jQuery object passed."
      },
      "not": {
        "!type": "fn(selector: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/not/",
        "!doc": "Remove elements from the set of matched elements."
      },
      "off": {
        "!type": "fn(events: string, selector?: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/off/",
        "!doc": "Remove an event handler."
      },
      "offset": {
        "!type": "fn() -> offset",
        "!url": "http://api.jquery.com/offset/",
        "!doc": "Get the current coordinates of the first element, or set the coordinates of every element, in the set of matched elements, relative to the document."
      },
      "offsetParent": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/offsetParent/",
        "!doc": "Get the closest ancestor element that is positioned."
      },
      "on": {
        "!type": "fn(events: string, handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/on/",
        "!doc": "Attach an event handler function for one or more events to the selected elements."
      },
      "one": {
        "!type": "fn(events: string, data?: ?, handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/one/",
        "!doc": "Attach a handler to an event for the elements. The handler is executed at most once per element."
      },
      "outerHeight": {
        "!type": "fn(includeMargin?: bool) -> number",
        "!url": "http://api.jquery.com/outerHeight/",
        "!doc": "Get the current computed height for the first element in the set of matched elements, including padding, border, and optionally margin. Returns an integer (without 'px') representation of the value or null if called on an empty set of elements."
      },
      "outerWidth": {
        "!type": "fn(includeMargin?: bool) -> number",
        "!url": "http://api.jquery.com/outerWidth/",
        "!doc": "Get the current computed width for the first element in the set of matched elements, including padding and border."
      },
      "parent": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/parent/",
        "!doc": "Get the parent of each element in the current set of matched elements, optionally filtered by a selector."
      },
      "parents": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/parents/",
        "!doc": "Get the ancestors of each element in the current set of matched elements, optionally filtered by a selector."
      },
      "parentsUntil": {
        "!type": "fn(selector?: string, filter?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/parentsUntil/",
        "!doc": "Get the ancestors of each element in the current set of matched elements, up to but not including the element matched by the selector, DOM node, or jQuery object."
      },
      "position": {
        "!type": "fn() -> offset",
        "!url": "http://api.jquery.com/position/",
        "!doc": "Get the current coordinates of the first element in the set of matched elements, relative to the offset parent."
      },
      "prepend": {
        "!type": "fn(content: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/prepend/",
        "!doc": "Insert content, specified by the parameter, to the beginning of each element in the set of matched elements."
      },
      "prependTo": {
        "!type": "fn(target: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/prependTo/",
        "!doc": "Insert every element in the set of matched elements to the beginning of the target."
      },
      "prev": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/prev/",
        "!doc": "Get the immediately preceding sibling of each element in the set of matched elements, optionally filtered by a selector."
      },
      "prevAll": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/prevAll/",
        "!doc": "Get all preceding siblings of each element in the set of matched elements, optionally filtered by a selector."
      },
      "prevUntil": {
        "!type": "fn(selector?: string, filter?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/prevUntil/",
        "!doc": "Get all preceding siblings of each element up to but not including the element matched by the selector, DOM node, or jQuery object."
      },
      "promise": {
        "!type": "fn(type?: string, target: ?) -> +jQuery.Promise",
        "!url": "http://api.jquery.com/promise/",
        "!doc": "Return a Promise object to observe when all actions of a certain type bound to the collection, queued or not, have finished."
      },
      "prop": {
        "!type": "fn(name: string, value?: string) -> string",
        "!url": "http://api.jquery.com/prop/",
        "!doc": "Get the value of a property for the first element in the set of matched elements or set one or more properties for every matched element."
      },
      "pushStack": {
        "!type": "fn(elements: [+Element]) -> jQuery.fn",
        "!url": "http://api.jquery.com/pushStack/",
        "!doc": "Add a collection of DOM elements onto the jQuery stack."
      },
      "queue": {
        "!type": "fn(queue?: string) -> [?]",
        "!url": "http://api.jquery.com/queue/",
        "!doc": "Show or manipulate the queue of functions to be executed on the matched elements."
      },
      "ready": {
        "!type": "fn(fn: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/ready/",
        "!doc": "Specify a function to execute when the DOM is fully loaded."
      },
      "remove": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/remove/",
        "!doc": "Remove the set of matched elements from the DOM."
      },
      "removeAttr": {
        "!type": "fn(attrName: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/removeAttr/",
        "!doc": "Remove an attribute from each element in the set of matched elements."
      },
      "removeClass": {
        "!type": "fn(className?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/removeClass/",
        "!doc": "Remove a single class, multiple classes, or all classes from each element in the set of matched elements."
      },
      "removeData": {
        "!type": "fn(name?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/removeData/",
        "!doc": "Remove a previously-stored piece of data."
      },
      "removeProp": {
        "!type": "fn(propName: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/removeProp/",
        "!doc": "Remove a property for the set of matched elements."
      },
      "replaceAll": {
        "!type": "fn(target: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/replaceAll/",
        "!doc": "Replace each target element with the set of matched elements."
      },
      "replaceWith": {
        "!type": "fn(newContent: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/replaceWith/",
        "!doc": "Replace each element in the set of matched elements with the provided new content and return the set of elements that was removed."
      },
      "resize": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/resize/",
        "!doc": "Bind an event handler to the 'resize' JavaScript event, or trigger that event on an element."
      },
      "scroll": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/scroll/",
        "!doc": "Bind an event handler to the 'scroll' JavaScript event, or trigger that event on an element."
      },
      "scrollLeft": {
        "!type": "number",
        "!url": "http://api.jquery.com/scrollLeft/",
        "!doc": "Get the current horizontal position of the scroll bar for the first element in the set of matched elements or set the horizontal position of the scroll bar for every matched element."
      },
      "scrollTop": {
        "!type": "number",
        "!url": "http://api.jquery.com/scrollTop/",
        "!doc": "Get the current vertical position of the scroll bar for the first element in the set of matched elements or set the vertical position of the scroll bar for every matched element."
      },
      "select": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/select/",
        "!doc": "Bind an event handler to the 'select' JavaScript event, or trigger that event on an element."
      },
      "selector": {
        "!type": "string",
        "!url": "http://api.jquery.com/selector/",
        "!doc": "A selector representing selector passed to jQuery(), if any, when creating the original set."
      },
      "serialize": {
        "!type": "fn() -> string",
        "!url": "http://api.jquery.com/serialize/",
        "!doc": "Encode a set of form elements as a string for submission."
      },
      "serializeArray": {
        "!type": "fn() -> [keyvalue]",
        "!url": "http://api.jquery.com/serializeArray/",
        "!doc": "Encode a set of form elements as an array of names and values."
      },
      "show": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/show/",
        "!doc": "Display the matched elements."
      },
      "siblings": {
        "!type": "fn(selector?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/siblings/",
        "!doc": "Get the siblings of each element in the set of matched elements, optionally filtered by a selector."
      },
      "size": {
        "!type": "fn() -> number",
        "!url": "http://api.jquery.com/size/",
        "!doc": "Return the number of elements in the jQuery object."
      },
      "slice": {
        "!type": "fn(start: number, end?: number) -> jQuery.fn",
        "!url": "http://api.jquery.com/slice/",
        "!doc": "Reduce the set of matched elements to a subset specified by a range of indices."
      },
      "slideDown": {
        "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/slideDown/",
        "!doc": "Display the matched elements with a sliding motion."
      },
      "slideToggle": {
        "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/slideToggle/",
        "!doc": "Display or hide the matched elements with a sliding motion."
      },
      "slideUp": {
        "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/slideUp/",
        "!doc": "Hide the matched elements with a sliding motion."
      },
      "stop": {
        "!type": "fn(clearQueue?: bool, jumpToEnd?: bool) -> jQuery.fn",
        "!url": "http://api.jquery.com/stop/",
        "!doc": "Stop the currently-running animation on the matched elements."
      },
      "submit": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/submit/",
        "!doc": "Bind an event handler to the 'submit' JavaScript event, or trigger that event on an element."
      },
      "text": {
        "!type": "fn() -> string",
        "!url": "http://api.jquery.com/text/",
        "!doc": "Get the combined text contents of each element in the set of matched elements, including their descendants, or set the text contents of the matched elements."
      },
      "toArray": {
        "!type": "fn() -> [+Element]",
        "!url": "http://api.jquery.com/toArray/",
        "!doc": "Retrieve all the DOM elements contained in the jQuery set, as an array."
      },
      "toggle": {
        "!type": "fn(duration?: number, complete?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/toggle/",
        "!doc": "Display or hide the matched elements."
      },
      "toggleClass": {
        "!type": "fn(className: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/toggleClass/",
        "!doc": "Add or remove one or more classes from each element in the set of matched elements, depending on either the class's presence or the value of the switch argument."
      },
      "trigger": {
        "!type": "fn(eventType: string, params: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/trigger/",
        "!doc": "Execute all handlers and behaviors attached to the matched elements for the given event type."
      },
      "triggerHandler": {
        "!type": "fn(eventType: string, params: ?) -> ?",
        "!url": "http://api.jquery.com/triggerHandler/",
        "!doc": "Execute all handlers attached to an element for an event."
      },
      "unbind": {
        "!type": "fn(eventType?: string, handler?: fn()) -> jQuery.fn",
        "!url": "http://api.jquery.com/unbind/",
        "!doc": "Remove a previously-attached event handler from the elements."
      },
      "undelegate": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/undelegate/",
        "!doc": "Remove a handler from the event for all elements which match the current selector, based upon a specific set of root elements."
      },
      "unload": {
        "!type": "fn(handler: fn(+jQuery.Event)) -> jQuery.fn",
        "!url": "http://api.jquery.com/unload/",
        "!doc": "Bind an event handler to the 'unload' JavaScript event."
      },
      "unwrap": {
        "!type": "fn() -> jQuery.fn",
        "!url": "http://api.jquery.com/unwrap/",
        "!doc": "Remove the parents of the set of matched elements from the DOM, leaving the matched elements in their place."
      },
      "val": {
        "!type": "fn() -> string",
        "!url": "http://api.jquery.com/val/",
        "!doc": "Get the current value of the first element in the set of matched elements or set the value of every matched element."
      },
      "width": {
        "!type": "fn() -> number",
        "!url": "http://api.jquery.com/width/",
        "!doc": "Get the current computed width for the first element in the set of matched elements or set the width of every matched element."
      },
      "wrap": {
        "!type": "fn(wrappingElement: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/wrap/",
        "!doc": "Wrap an HTML structure around each element in the set of matched elements."
      },
      "wrapAll": {
        "!type": "fn(wrappingElement: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/wrapAll/",
        "!doc": "Wrap an HTML structure around all elements in the set of matched elements."
      },
      "wrapInner": {
        "!type": "fn(wrappingElement: ?) -> jQuery.fn",
        "!url": "http://api.jquery.com/wrapInner/",
        "!doc": "Wrap an HTML structure around the content of each element in the set of matched elements."
      },

      "slice": {
        "!type": "fn(start: number, end: number) -> jQuery.fn",
        "!url": "http://api.jquery.com/slice/",
        "!doc": "Reduce the set of matched elements to a subset specified by a range of indices."
      },
      "push": {
        "!type": "Array.prototype.push",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/push",
        "!doc": "Mutates an array by appending the given elements and returning the new length of the array."
      },
      "sort": {
        "!type": "Array.prototype.sort",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/sort",
        "!doc": "Sorts the elements of an array in place and returns the array."
      },
      "splice": {
        "!type": "Array.prototype.splice",
        "!url": "https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Array/splice",
        "!doc": "Changes the content of an array, adding new elements while removing old elements."
      }
    },
    "ajax": {
      "!type": "fn(url: string, settings: ?) -> +jQuery.jqXHR",
      "!url": "http://api.jquery.com/jquery.ajax/",
      "!doc": "Perform an asynchronous HTTP (Ajax) request."
    },
    "ajaxPrefilter": {
      "!type": "fn(dataTypes?: string, handler: fn(options: ?, originalOptions: ?, req: +XMLHttpRequest))",
      "!url": "http://api.jquery.com/jquery.ajaxPrefilter/",
      "!doc": "Handle custom Ajax options or modify existing options before each request is sent and before they are processed by $.ajax()."
    },
    "ajaxSetup": {
      "!type": "fn(options: ?)",
      "!url": "http://api.jquery.com/jquery.ajaxSetup/",
      "!doc": "Set default values for future Ajax requests. Its use is not recommended."
    },
    "ajaxTransport": {
      "!type": "fn(dataType: string, handler: fn(options: ?, originalOptions: ?, req: +XMLHttpRequest))",
      "!url": "http://api.jquery.com/jquery.ajaxTransport/",
      "!doc": "Creates an object that handles the actual transmission of Ajax data."
    },
    "Callbacks": {
      "!type": "fn(flags: string) -> +jQuery.Callbacks",
      "!url": "http://api.jquery.com/jquery.Callbacks/",
      "!doc": "A multi-purpose callbacks list object that provides a powerful way to manage callback lists.",
      "prototype": {
        "add":{
          "!type": "fn(callbacks: ?) -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.add/",
          "!doc": "Add a callback or a collection of callbacks to a callback list."
        },
        "disable":{
          "!type": "fn() -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.disable/",
          "!doc": "Disable a callback list from doing anything more."
        },
        "disabled":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/callbacks.disabled/",
          "!doc": "Determine if the callbacks list has been disabled."
        },
        "empty":{
          "!type": "fn() -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.empty/",
          "!doc": "Remove all of the callbacks from a list."
        },
        "fire":{
          "!type": "fn(arguments: ?) -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.fire/",
          "!doc": "Call all of the callbacks with the given arguments"
        },
        "fired":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/callbacks.fired/",
          "!doc": "Determine if the callbacks have already been called at least once."
        },
        "fireWith":{
          "!type": "fn(context?: ?, args?: ?) -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.fireWith/",
          "!doc": "Call all callbacks in a list with the given context and arguments."
        },
        "has":{
          "!type": "fn(callback: fn()) -> bool",
          "!url": "http://api.jquery.com/callbacks.has/",
          "!doc": "Determine whether a supplied callback is in a list."
        },
        "lock":{
          "!type": "fn() -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.lock/",
          "!doc": "Lock a callback list in its current state."
        },
        "locked":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/callbacks.locked/",
          "!doc": "Determine if the callbacks list has been locked."
        },
        "remove":{
          "!type": "fn(callbacks: ?) -> +jQuery.Callbacks",
          "!url": "http://api.jquery.com/callbacks.remove/",
          "!doc": "Remove a callback or a collection of callbacks from a callback list."
        }
      }
    },
    "contains": {
      "!type": "fn(container: +Element, contained: +Element) -> bool",
      "!url": "http://api.jquery.com/jquery.contains/",
      "!doc": "Check to see if a DOM element is a descendant of another DOM element."
    },
    "cssHooks": {
      "!type": "?",
      "!url": "http://api.jquery.com/cssHooks/",
      "!doc": "Hook directly into jQuery to override how particular CSS properties are retrieved or set, normalize CSS property naming, or create custom properties."
    },
    "data": {
      "!type": "fn(element: +Element, key: string, value: ?) -> !2",
      "!url": "http://api.jquery.com/jquery.data/",
      "!doc": "Store arbitrary data associated with the specified element and/or return the value that was set."
    },
    "Event": {
      "!type": "fn(type: ?, props?: ?) -> +jQuery.Event",
      "!url": "http://api.jquery.com/category/events/event-object/",
      "!doc": "The jQuery.Event constructor is exposed and can be used when calling trigger. The new operator is optional.",
      "prototype": {
        "currentTarget":{
          "!type": "+Element",
          "!url": "http://api.jquery.com/event.currentTarget/",
          "!doc": "The current DOM element within the event bubbling phase."
        },
        "data":{
          "!type": "?",
          "!url": "http://api.jquery.com/event.data/",
          "!doc": "An optional object of data passed to an event method when the current executing handler is bound."
        },
        "delegateTarget":{
          "!type": "+Element",
          "!url": "http://api.jquery.com/event.delegateTarget/",
          "!doc": "The element where the currently-called jQuery event handler was attached."
        },
        "isDefaultPrevented":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/event.isDefaultPrevented/",
          "!doc": "Returns whether event.preventDefault() was ever called on this event object."
        },
        "isImmediatePropagationStopped":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/event.isImmediatePropagationStopped/",
          "!doc": "Returns whether event.stopImmediatePropagation() was ever called on this event object."
        },
        "isPropagationStopped":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/event.isPropagationStopped/",
          "!doc": "Returns whether event.stopPropagation() was ever called on this event object."
        },
        "metaKey":{
          "!type": "bool",
          "!url": "http://api.jquery.com/event.metaKey/",
          "!doc": "Indicates whether the META key was pressed when the event fired."
        },
        "namespace":{
          "!type": "string",
          "!url": "http://api.jquery.com/event.namespace/",
          "!doc": "The namespace specified when the event was triggered."
        },
        "pageX":{
          "!type": "number",
          "!url": "http://api.jquery.com/event.pageX/",
          "!doc": "The mouse position relative to the left edge of the document."
        },
        "pageY":{
          "!type": "number",
          "!url": "http://api.jquery.com/event.pageY/",
          "!doc": "The mouse position relative to the top edge of the document."
        },
        "preventDefault":{
          "!type": "fn()",
          "!url": "http://api.jquery.com/event.preventDefault/",
          "!doc": "If this method is called, the default action of the event will not be triggered."
        },
        "relatedTarget":{
          "!type": "+Element",
          "!url": "http://api.jquery.com/event.relatedTarget/",
          "!doc": "The other DOM element involved in the event, if any."
        },
        "result":{
          "!type": "?",
          "!url": "http://api.jquery.com/event.result/",
          "!doc": "The last value returned by an event handler that was triggered by this event, unless the value was undefined."
        },
        "stopImmediatePropagation":{
          "!type": "fn()",
          "!url": "http://api.jquery.com/event.stopImmediatePropagation/",
          "!doc": "Keeps the rest of the handlers from being executed and prevents the event from bubbling up the DOM tree."
        },
        "stopPropagation":{
          "!type": "fn()",
          "!url": "http://api.jquery.com/event.stopPropagation/",
          "!doc": "Prevents the event from bubbling up the DOM tree, preventing any parent handlers from being notified of the event."
        },
        "target":{
          "!type": "+Element",
          "!url": "http://api.jquery.com/event.target/",
          "!doc": "The DOM element that initiated the event."
        },
        "timeStamp":{
          "!type": "number",
          "!url": "http://api.jquery.com/event.timeStamp/",
          "!doc": "The difference in milliseconds between the time the browser created the event and January 1, 1970."
        },
        "type":{
          "!type": "string",
          "!url": "http://api.jquery.com/event.type/",
          "!doc": "Describes the nature of the event."
        },
        "which":{
          "!type": "number",
          "!url": "http://api.jquery.com/event.which/",
          "!doc": "For key or mouse events, this property indicates the specific key or button that was pressed."
        }
      }
    },
    "Deferred": {
      "!type": "fn(beforeStart?: fn(deferred: +jQuery.Deferred)) -> +jQuery.Deferred",
      "!url": "http://api.jquery.com/jQuery.Deferred/",
      "!doc": "A constructor function that returns a chainable utility object with methods to register multiple callbacks into callback queues, invoke callback queues, and relay the success or failure state of any synchronous or asynchronous function.",
      "prototype": {
        "always":{
          "!type": "fn(callback: fn()) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.always/",
          "!doc": "Add handlers to be called when the Deferred object is either resolved or rejected."
        },
        "done":{
          "!type": "fn(callback: fn()) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.done/",
          "!doc": "Add handlers to be called when the Deferred object is resolved."
        },
        "fail":{
          "!type": "fn(callback: fn()) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.fail/",
          "!doc": "Add handlers to be called when the Deferred object is rejected."
        },
        "isRejected":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/deferred.isRejected/",
          "!doc": "Determine whether a Deferred object has been rejected."
        },
        "isResolved":{
          "!type": "fn() -> bool",
          "!url": "http://api.jquery.com/deferred.isResolved/",
          "!doc": "Determine whether a Deferred object has been resolved."
        },
        "notify":{
          "!type": "fn(args?: ?) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.notify/",
          "!doc": "Call the progressCallbacks on a Deferred object with the given args."
        },
        "notifyWith":{
          "!type": "fn(context?: ?, args?: ?) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.notifyWith/",
          "!doc": "Call the progressCallbacks on a Deferred object with the given context and args."
        },
        "pipe":{
          "!type": "fn(doneFilter?: fn(), failFilter?: fn()) -> +jQuery.Promise",
          "!url": "http://api.jquery.com/deferred.pipe/",
          "!doc": "Utility method to filter and/or chain Deferreds."
        },
        "progress":{
          "!type": "fn(callback: fn()) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.progress/",
          "!doc": "Add handlers to be called when the Deferred object generates progress notifications."
        },
        "promise":{
          "!type": "fn(target: ?) -> +jQuery.Promise",
          "!url": "http://api.jquery.com/deferred.promise/",
          "!doc": "Return a Deferred's Promise object."
        },
        "reject":{
          "!type": "fn(args?: ?) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.reject/",
          "!doc": "Reject a Deferred object and call any failCallbacks with the given args."
        },
        "rejectWith":{
          "!type": "fn(context?: ?, args?: ?) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.rejectWith/",
          "!doc": "Reject a Deferred object and call any failCallbacks with the given context and args."
        },
        "resolve":{
          "!type": "fn(args?: ?) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.resolve/",
          "!doc": "Resolve a Deferred object and call any doneCallbacks with the given args."
        },
        "resolveWith":{
          "!type": "fn(context?: ?, args?: ?) -> +jQuery.Deferred",
          "!url": "http://api.jquery.com/deferred.resolveWith/",
          "!doc": "Resolve a Deferred object and call any doneCallbacks with the given context and args."
        },
        "state":{
          "!type": "fn() -> string",
          "!url": "http://api.jquery.com/deferred.state/",
          "!doc": "Determine the current state of a Deferred object."
        },
        "then":{
          "!type": "fn(doneFilter: fn(), failFilter?: fn(), progressFilter?: fn()) -> +jQuery.Promise",
          "!url": "http://api.jquery.com/deferred.then/",
          "!doc": "Add handlers to be called when the Deferred object is resolved, rejected, or still in progress."
        }
      }
    },
    "Promise": {
      "!url": "http://api.jquery.com/jQuery.Deferred/",
      "!doc": "A constructor function that returns a chainable utility object with methods to register multiple callbacks into callback queues, invoke callback queues, and relay the success or failure state of any synchronous or asynchronous function.",
      "prototype": {
        "always": "fn(callback: fn()) -> +jQuery.Promise",
        "done": "fn(callback: fn()) -> +jQuery.Promise",
        "fail": "fn(callback: fn()) -> +jQuery.Promise",
        "isRejected": "fn() -> bool",
        "isResolved": "fn() -> bool",
        "pipe": "fn(doneFilter?: fn(), failFilter?: fn()) -> +jQuery.Promise",
        "promise": "fn(target: ?) -> +jQuery.Deferred",
        "state": "fn() -> string",
        "then": "fn(doneFilter: fn(), failFilter?: fn(), progressFilter?: fn()) -> +jQuery.Promise"
      }
    },
    "jqXHR": {
      "prototype": {
        "always": "fn(callback: fn()) -> +jQuery.jqXHR",
        "done": "fn(callback: fn()) -> +jQuery.jqXHR",
        "fail": "fn(callback: fn()) -> +jQuery.jqXHR",
        "isRejected": "fn() -> bool",
        "isResolved": "fn() -> bool",
        "pipe": "fn(doneFilter?: fn(), failFilter?: fn()) -> +jQuery.Promise",
        "promise": "fn(target: ?) -> +jQuery.Promise",
        "state": "fn() -> string",
        "then": "fn(doneFilter: fn(), failFilter?: fn(), progressFilter?: fn()) -> +jQuery.Promise",
        "readyState": "number",
        "status": "number",
        "statusText": "string",
        "resoponseText": "string",
        "resoponseXML": "string",
        "setRequestHeader": "fn(name: string, val: string)",
        "getAllResponseHeader": "fn() ->",
        "getResponseHeader": "fn() ->",
        "statusCode": "fn() -> number",
        "abort": "fn()"
      }
    },
    "dequeue": {
        "!type": "fn(queue?: string) -> jQuery.fn",
        "!url": "http://api.jquery.com/jQuery.dequeue/",
        "!doc": "Execute the next function on the queue for the matched elements."
    },
    "each": {
      "!type": "fn(collection: ?, callback: fn(i: number, elt: ?)) -> !0",
      "!effects": ["call !1 number !0.<i>"],
      "!url": "http://api.jquery.com/jQuery.each/",
      "!doc": "A generic iterator function, which can be used to seamlessly iterate over both objects and arrays. Arrays and array-like objects with a length property (such as a function's arguments object) are iterated by numeric index, from 0 to length-1. Other objects are iterated via their named properties."
    },
    "error": "fn(message: string)",
    "extend": {
      "!type": "fn(target: ?, source: ?) -> !0",
      "!effects": ["copy !1 !0"]
    },
    "fx": {
      "!type": "fn(elem: +Element, options: ?, prop: string, end?: number, easing?: bool)",
      "interval":{
        "!type": "number",
        "!url": "http://api.jquery.com/jquery.fx.interval",
        "!doc": "The rate (in milliseconds) at which animations fire."
      },
      "off":{
        "!type": "bool",
        "!url": "http://api.jquery.com/jquery.fx.off",
        "!doc": "Globally disable all animations."
      },
      "speeds": {
        "slow": "number",
        "fast": "number",
        "_default": "number"
      },
      "stop": "fn()",
      "tick": "fn()",
      "start": "fn()"
    },
    "get":{
      "!type": "fn(url: string, data?: ?, success: fn(data: string, textStatus: string, req: +XMLHttpRequest), dataType?: string) -> +jQuery.jqXHR",
      "!url": "http://api.jquery.com/jquery.get/",
      "!doc": "Load data from the server using a HTTP GET request."
    },
    "getJSON": {
      "!type": "fn(url: string, data?: ?, success: fn(data: ?, textStatus: string, req: +XMLHttpRequest)) -> +jQuery.jqXHR",
      "!url": "http://api.jquery.com/jquery.getJSON/",
      "!doc": "Load JSON-encoded data from the server using a GET HTTP request."
    },
    "getScript": {
      "!type": "fn(url: string, success?: fn(script: string, textStatus: string, req: +XMLHttpRequest)) -> +jQuery.jqXHR",
      "!url": "http://api.jquery.com/jquery.getScript/",
      "!doc": "Load a JavaScript file from the server using a GET HTTP request, then execute it."
    },
    "globalEval": {
      "!type": "fn(code: string)",
      "!url": "http://api.jquery.com/jquery.globalEval/",
      "!doc": "Execute some JavaScript code globally."
    },
    "grep": {
      "!type": "fn(array: [?], filter: fn(elt: ?, i: number), invert?: bool) -> !0",
      "!effects": ["call !1 !0.<i> number"],
      "!url":"http://api.jquery.com/jquery.grep/",
      "!doc":"Finds the elements of an array which satisfy a filter function. The original array is not affected."
    },
    "hasData": {
      "!type": "fn(element: +Element) -> bool",
      "!url": "http://api.jquery.com/jquery.hasData/",
      "!doc": "Determine whether an element has any jQuery data associated with it."
    },
    "holdReady": {
      "!type": "fn(hold: bool)",
      "!url": "http://api.jquery.com/jquery.holdReady/",
      "!doc": "Holds or releases the execution of jQuery's ready event."
    },
    "inArray": {
      "!type": "fn(value: ?, array: [?], from?: number) -> number",
      "!url": "http://api.jquery.com/jquery.inArray/",
      "!doc": "Search for a specified value within an array and return its index (or -1 if not found)."
    },
    "isArray": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isArray/",
      "!doc": "Determine whether the argument is an array."
    },
    "isEmptyObject": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isEmptyObject/",
      "!doc": "Check to see if an object is empty (contains no enumerable properties)."
    },
    "isFunction": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isFunction/",
      "!doc": "Determine if the argument passed is a Javascript function object."
    },
    "isNumeric": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isNumeric/",
      "!doc": "Determines whether its argument is a number."
    },
    "isPlainObject": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isPlainObject/",
      "!doc": "Check to see if an object is a plain object (created using '{}' or 'new Object')."
    },
    "isWindow": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isWindow/",
      "!doc": "Determine whether the argument is a window."
    },
    "isXMLDoc": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isXMLDoc/",
      "!doc": "Check to see if a DOM node is within an XML document (or is an XML document)."
    },
    "isFunction": {
      "!type": "fn(obj: ?) -> bool",
      "!url": "http://api.jquery.com/jquery.isFunction/",
      "!doc": ""
    },
    "makeArray": {
      "!type": "fn(obj: ?) -> [!0.<i>]",
      "!url": "http://api.jquery.com/jquery.makeArray/",
      "!doc": "Convert an array-like object into a true JavaScript array."
    },
    "map": {
      "!type": "fn(array: [?], callback: fn(element: ?, i: number) -> ?) -> [!1.!ret]",
      "!effects": ["call !1 !0.<i> number"],
      "!url": "http://api.jquery.com/jquery.map/",
      "!doc": "Translate all items in an array or object to new array of items."
    },
    "merge": {
      "!type": "fn(first: [?], second: [?]) -> !0",
      "!url": "http://api.jquery.com/jquery.merge/",
      "!doc": "Merge the contents of two arrays together into the first array."
    },
    "noConflict": {
      "!type": "fn(removeAll?: bool) -> jQuery",
      "!url": "http://api.jquery.com/jquery.noConflict/",
      "!doc": "Relinquish jQuery's control of the $ variable."
    },
    "noop": {
      "!type": "fn()",
      "!url": "http://api.jquery.com/jquery.noop/",
      "!doc": "An empty function."
    },
    "now": {
      "!type": "fn() -> number",
      "!url": "http://api.jquery.com/jquery.now/",
      "!doc": "Return a number representing the current time."
    },
    "param": {
      "!type": "fn(obj: ?) -> string",
      "!url": "http://api.jquery.com/jquery.param/",
      "!doc": "Create a serialized representation of an array or object, suitable for use in a URL query string or Ajax request."
    },
    "parseHTML": {
      "!type": "fn(data: string, context?: +Element, keepScripts?: bool) -> [+Element]",
      "!url": "http://api.jquery.com/jquery.parseHTML/",
      "!doc": "Parses a string into an array of DOM nodes."
    },
    "parseJSON": {
      "!type": "fn(json: string) -> ?",
      "!url": "http://api.jquery.com/jquery.parseJSON/",
      "!doc": "Takes a well-formed JSON string and returns the resulting JavaScript object."
    },
    "parseXML": {
      "!type": "fn(xml: string) -> +XMLDocument",
      "!url": "http://api.jquery.com/jquery.parseXML/",
      "!doc": "Parses a string into an XML document."
    },
    "post": {
      "!type": "fn(url: string, data?: ?, success: fn(data: string, textStatus: string, req: +XMLHttpRequest), dataType?: string) -> +jQuery.jqXHR",
      "!url": "http://api.jquery.com/jquery.post/",
      "!doc": "Load data from the server using a HTTP POST request."
    },
    "proxy": {
      "!type": "fn(function: fn(), context: ?) -> fn()",
      "!url": "http://api.jquery.com/jquery.proxy/",
      "!doc": "Takes a function and returns a new one that will always have a particular context."
    },
    "queue": {
      "!type": "fn(element: +Element, queue?: string) -> [?]",
      "!url": "http://api.jquery.com/jquery.queue/",
      "!doc": "Show or manipulate the queue of functions to be executed on the matched element."
    },
    "removeData": {
      "!type": "fn(element: +Element, name?: string)",
      "!url": "http://api.jquery.com/jquery.removeData/",
      "!doc": ""
    },
    "sub": {
      "!type": "fn() -> jQuery",
      "!url": "http://api.jquery.com/jquery.sub/",
      "!doc": "Remove a previously-stored piece of data."
    },
    "support": {
      "!url": "http://api.jquery.com/jquery.support/",
      "!doc": "A collection of properties that represent the presence of different browser features or bugs. Primarily intended for jQuery's internal use; specific properties may be removed when they are no longer needed internally to improve page startup performance.",
      "getSetAttribute": "bool",
      "leadingWhitespace": "bool",
      "tbody": "bool",
      "htmlSerialize": "bool",
      "style": "bool",
      "hrefNormalized": "bool",
      "opacity": "bool",
      "cssFloat": "bool",
      "checkOn": "bool",
      "optSelected": "bool",
      "enctype": "bool",
      "html5Clone": "bool",
      "boxModel": "bool",
      "deleteExpando": "bool",
      "noCloneEvent": "bool",
      "inlineBlockNeedsLayout": "bool",
      "shrinkWrapBlocks": "bool",
      "reliableMarginRight": "bool",
      "boxSizingReliable": "bool",
      "pixelPosition": "bool",
      "noCloneChecked": "bool",
      "optDisabled": "bool",
      "input": "bool",
      "radioValue": "bool",
      "appendChecked": "bool",
      "checkClone": "bool",
      "clearCloneStyle": "bool",
      "reliableHiddenOffsets": "bool",
      "boxSizing": "bool",
      "doesNotIncludeMarginInBodyOffset": "bool",
      "cors": "bool",
      "ajax": "bool"
    },
    "trim": {
      "!type": "fn(str: string) -> string",
      "!url": "http://api.jquery.com/jquery.trim/",
      "!doc": "Remove the whitespace from the beginning and end of a string."
    },
    "type": {
      "!type": "fn(obj: ?) -> string",
      "!url": "http://api.jquery.com/jquery.type/",
      "!doc": "Determine the internal JavaScript [[Class]] of an object."
    },
    "unique": {
      "!type": "fn(array: [?]) -> !0",
      "!url": "http://api.jquery.com/jquery.unique/",
      "!doc": "Sorts an array of DOM elements, in place, with the duplicates removed. Note that this only works on arrays of DOM elements, not strings or numbers."
    },
    "when": {
      "!type": "fn(deferred: +jQuery.Deferred) -> +jQuery.Promise",
      "!url": "http://api.jquery.com/jquery.when/",
      "!doc": "Provides a way to execute callback functions based on one or more objects, usually Deferred objects that represent asynchronous events."
    }
  },
  "$": "jQuery"
};

//#endregion


//#region tern/defs/underscore.json

var def_underscore = {
    "!name": "underscore",
    "_": {
        "!doc": "Save the previous value of the `_` variable.",
        "!type": "fn(obj: ?) -> +_",
        "VERSION": {
            "!type": "string",
            "!url": "http://underscorejs.org/#VERSION"
        },
        "after": {
            "!doc": "Returns a function that will only be executed after being called N times.",
            "!url": "http://underscorejs.org/#after",
            "!type": "fn(times: number, func: fn()) -> !1"
        },
        "all": "_.every",
        "any": "_.some",
        "bind": {
            "!doc": "Create a function bound to a given object (assigning `this`, and arguments, optionally).",
            "!type": "fn(func: ?, context?: ?, args?: ?) -> !0",
            "!url": "http://underscorejs.org/#bind"
        },
        "bindAll": {
            "!doc": "Bind all of an object's methods to that object.",
            "!type": "fn(obj: ?, names?: [string])",
            "!url": "http://underscorejs.org/#bindAll"
        },
        "chain": {
            "!doc": "Add a \"chain\" function, which will delegate to the wrapper.",
            "!type": "fn(obj: ?)",
            "!url": "http://underscorejs.org/#chain"
        },
        "clone": {
            "!doc": "Create a (shallow-cloned) duplicate of an object.",
            "!type": "fn(obj: ?) -> !0",
            "!url": "http://underscorejs.org/#clone"
        },
        "collect": "_.map",
        "compact": {
            "!doc": "Trim out all falsy values from an array.",
            "!type": "fn(array: [?]) -> [?]",
            "!url": "http://underscorejs.org/#compact"
        },
        "compose": {
            "!doc": "Returns a function that is the composition of a list of functions, each consuming the return value of the function that follows.",
            "!type": "fn(a: fn(), b: fn()) -> fn() -> !1.!ret",
            "!url": "http://underscorejs.org/#compose"
        },
        "contains": {
            "!doc": "Determine if the array or object contains a given value (using `===`).",
            "!type": "fn(list: [?], target: ?) -> bool",
            "!url": "http://underscorejs.org/#contains"
        },
        "countBy": {
            "!doc": "Counts instances of an object that group by a certain criterion.",
            "!type": "fn(obj: ?, iterator: fn(elt: ?, i: number) -> ?, context?: ?) -> ?",
            "!url": "http://underscorejs.org/#countBy"
        },
        "debounce": {
            "!doc": "Returns a function, that, as long as it continues to be invoked, will not be triggered.",
            "!type": "fn(func: fn(), wait: number, immediate?: bool) -> !0",
            "!url": "http://underscorejs.org/#debounce"
        },
        "defaults": {
            "!doc": "Fill in a given object with default properties.",
            "!type": "fn(obj: ?, defaults: ?) -> !0",
            "!effects": ["copy !1 !0"],
            "!url": "http://underscorejs.org/#defaults"
        },
        "defer": {
            "!doc": "Defers a function, scheduling it to run after the current call stack has cleared.",
            "!type": "fn(func: fn(), args?: ?) -> number",
            "!url": "http://underscorejs.org/#defer"
        },
        "delay": {
            "!doc": "Delays a function for the given number of milliseconds, and then calls it with the arguments supplied.",
            "!type": "fn(func: fn(), wait: number, args?: ?) -> number",
            "!url": "http://underscorejs.org/#delay"
        },
        "detect": "_.find",
        "difference": {
            "!doc": "Take the difference between one array and a number of other arrays.",
            "!type": "fn(array: [?], others?: [?]) -> !0",
            "!url": "http://underscorejs.org/#difference"
        },
        "drop": "_.rest",
        "each": {
            "!doc": "Iterates over a list of elements, yielding each in turn to an iterator function.",
            "!type": "fn(obj: [?], iterator: fn(value: ?, index: number), context?: ?)",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#each"
        },
        "escape": {
            "!doc": "Escapes a string for insertion into HTML.",
            "!type": "fn(string) -> string",
            "!url": "http://underscorejs.org/#escape"
        },
        "every": {
            "!doc": "Determine whether all of the elements match a truth test.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#every"
        },
        "extend": {
            "!doc": "Extend a given object with all the properties in passed-in object(s).",
            "!type": "fn(destination: ?, source1: ?, source2?: ?) -> !0",
            "!effects": ["copy !1 !0", "copy !2 !0"],
            "!url": "http://underscorejs.org/#extend"
        },
        "filter": {
            "!doc": "Looks through each value in the list, returning an array of all the values that pass a truth test.",
            "!type": "fn(list: [?], test: fn(value: ?, index: number) -> bool, context?: ?) -> !0",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#filter"
        },
        "find": {
            "!doc": "Return the first value which passes a truth test.",
            "!type": "fn(list: [?], test: fn(?) -> bool, context?: ?) -> !0.<i>",
            "!effects": ["call !1 !0.<i>"],
            "!url": "http://underscorejs.org/#find"
        },
        "findWhere": {
            "!doc": "Looks through the list and returns the first value that matches all of the key-value pairs listed in properties.",
            "!type": "fn(list: [?], attrs: ?) -> !0.<i>",
            "!url": "http://underscorejs.org/#findWhere"
        },
        "first": {
            "!doc": "Get the first element of an array. Passing n will return the first N values in the array.",
            "!type": "fn(list: [?], n?: number) -> !0.<i>",
            "!url": "http://underscorejs.org/#first"
        },
        "flatten": {
            "!doc": "Return a completely flattened version of an array.",
            "!type": "fn(array: [?], shallow?: bool) -> [?]",
            "!url": "http://underscorejs.org/#flatten"
        },
        "foldl": "_.reduce",
        "foldr": "_.reduceRight",
        "forEach": "_.each",
        "functions": {
            "!doc": "Return a sorted list of the function names available on the object.",
            "!type": "fn(obj: _) -> [string]",
            "!url": "http://underscorejs.org/#functions"
        },
        "groupBy": {
            "!doc": "Groups the object's values by a criterion.",
            "!type": "fn(obj: [?], iterator: fn(elt: ?, i: number) -> ?, context?: ?) -> ?",
            "!url": "http://underscorejs.org/#groupBy"
        },
        "has": {
            "!doc": "Shortcut function for checking if an object has a given property directly on itself (in other words, not on a prototype).",
            "!type": "fn(obj: ?, key: string) -> bool",
            "!url": "http://underscorejs.org/#has"
        },
        "head": "_.first",
        "identity": {
            "!doc": "Returns the same value that is used as the argument.",
            "!type": "fn(value: ?) -> !0",
            "!url": "http://underscorejs.org/#identity"
        },
        "include": "_.contains",
        "indexOf": {
            "!doc": "Returns the index at which value can be found in the array, or -1 if value is not present in the array.",
            "!type": "fn(list: [?], item: ?, isSorted?: bool) -> number",
            "!url": "http://underscorejs.org/#indexOf"
        },
        "initial": {
            "!doc": "Returns everything but the last entry of the array.",
            "!type": "fn(array: [?], n?: number) -> !0",
            "!url": "http://underscorejs.org/#initial"
        },
        "inject": "_.reduce",
        "intersection": {
            "!doc": "Produce an array that contains every item shared between all the passed-in arrays.",
            "!type": "fn(array: [?], others?: [?]) -> !0",
            "!url": "http://underscorejs.org/#intersection"
        },
        "invert": {
            "!doc": "Invert the keys and values of an object.",
            "!type": "fn(obj: ?) -> ?",
            "!url": "http://underscorejs.org/#invert"
        },
        "invoke": {
            "!doc": "Invoke a method (with arguments) on every item in a collection.",
            "!type": "fn(obj: ?, method: string, args?: ?) -> [?]",
            "!url": "http://underscorejs.org/#invoke"
        },
        "isArguments": {
            "!doc": "Returns true if object is an Arguments object.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isArguments"
        },
        "isArray": {
            "!doc": "Is a given value an array? Delegates to ECMA5's native Array.isArray",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isArray"
        },
        "isBoolean": {
            "!doc": "Is a given value a boolean?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isBoolean"
        },
        "isDate": {
            "!doc": "Returns true if object is a Date object.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isDate"
        },
        "isElement": {
            "!doc": "Is a given value a DOM element?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isElement"
        },
        "isEmpty": {
            "!doc": "Is a given array, string, or object empty? An \"empty\" object has no enumerable own-properties.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isEmpty"
        },
        "isEqual": {
            "!doc": "Perform a deep comparison to check if two objects are equal.",
            "!type": "fn(a: ?, b: ?) -> bool",
            "!url": "http://underscorejs.org/#isEqual"
        },
        "isFinite": {
            "!doc": "Is a given object a finite number?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isFinite"
        },
        "isFunction": {
            "!doc": "Returns true if object is a Function.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isFunction"
        },
        "isNaN": {
            "!doc": "Is the given value `NaN`? (NaN is the only number which does not equal itself).",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isNaN"
        },
        "isNull": {
            "!doc": "Is a given value equal to null?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isNull"
        },
        "isNumber": {
            "!doc": "Returns true if object is a Number (including NaN).",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isNumber"
        },
        "isObject": {
            "!doc": "Is a given variable an object?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isObject"
        },
        "isRegExp": {
            "!doc": "Returns true if object is a regular expression.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isRegExp"
        },
        "isString": {
            "!doc": "Returns true if object is a String.",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isString"
        },
        "isUndefined": {
            "!doc": "Is a given variable undefined?",
            "!type": "fn(obj: ?) -> bool",
            "!url": "http://underscorejs.org/#isUndefined"
        },
        "keys": {
            "!doc": "Retrieve the names of an object's properties. Delegates to ECMAScript 5's native `Object.keys`",
            "!type": "fn(obj: ?) -> [string]",
            "!url": "http://underscorejs.org/#keys"
        },
        "last": {
            "!doc": "Get the last element of an array.",
            "!type": "fn(array: [?], n?: number) -> !0.<i>",
            "!url": "http://underscorejs.org/#last"
        },
        "lastIndexOf": {
            "!doc": "Returns the index of the last occurrence of value in the array, or -1 if value is not present.",
            "!type": "fn(array: [?], item: ?, from?: number) -> number",
            "!url": "http://underscorejs.org/#lastIndexOf"
        },
        "map": {
            "!doc": "Produces a new array of values by mapping each value in list through a transformation function (iterator).",
            "!type": "fn(obj: [?], iterator: fn(elt: ?, i: number) -> ?, context?: ?) -> [!1.!ret]",
            "!effects": ["call !1 !this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#map"
        },
        "max": {
            "!doc": "Returns the maximum value in list.",
            "!type": "fn(list: [?], iterator?: fn(elt: ?, i: number) -> number, context?: ?) -> number",
            "!url": "http://underscorejs.org/#max"
        },
        "memoize": {
            "!doc": "Memoize an expensive function by storing its results.",
            "!type": "fn(func: fn(), hasher?: fn(args: ?) -> ?) -> !0",
            "!url": "http://underscorejs.org/#memoize"
        },
        "methods": "_.functions",
        "min": {
            "!doc": "Returns the minimum value in list.",
            "!type": "fn(list: [?], iterator?: fn(elt: ?, i: number) -> number, context?: ?) -> number",
            "!url": "http://underscorejs.org/#min"
        },
        "mixin": {
            "!doc": "Add your own custom functions to the Underscore object.",
            "!type": "fn(obj: _)",
            "!url": "http://underscorejs.org/#mixin"
        },
        "noConflict": {
            "!doc": "Run Underscore.js in *noConflict* mode, returning the `_` variable to its previous owner. Returns a reference to the Underscore object.",
            "!type": "fn() -> _",
            "!url": "http://underscorejs.org/#noConflict"
        },
        "object": {
            "!doc": "Converts lists into objects.",
            "!type": "fn(list: [?], values?: [?]) -> ?",
            "!url": "http://underscorejs.org/#object"
        },
        "omit": {
            "!doc": "Return a copy of the object without the blacklisted properties.",
            "!type": "fn(obj: ?, keys?: string) -> !0",
            "!url": "http://underscorejs.org/#omit"
        },
        "once": {
            "!doc": "Returns a function that will be executed at most one time, no matter how often you call it.",
            "!type": "fn(func: fn() -> ?) -> !0",
            "!url": "http://underscorejs.org/#once"
        },
        "pairs": {
            "!doc": "Convert an object into a list of `[key, value]` pairs.",
            "!type": "fn(obj: ?) -> [[?]]",
            "!url": "http://underscorejs.org/#pairs"
        },
        "partial": {
            "!doc": "Partially apply a function by creating a version that has had some of its arguments pre-filled, without changing its dynamic `this` context.",
            "!type": "fn(func: ?, args?: ?) -> fn()",
            "!url": "http://underscorejs.org/#partial"
        },
        "pick": {
            "!doc": "Return a copy of the object only containing the whitelisted properties.",
            "!type": "fn(obj: ?, keys?: string) -> !0",
            "!url": "http://underscorejs.org/#pick"
        },
        "pluck": {
            "!doc": "Convenience version of a common use case of `map`: fetching a property.",
            "!type": "fn(obj: [?], key: string) -> [?]",
            "!url": "http://underscorejs.org/#pluck"
        },
        "prototype": {
            "chain": {
                "!doc": "Start chaining a wrapped Underscore object.",
                "!type": "fn() -> !this"
            },
            "value": {
                "!doc": "Extracts the result from a wrapped and chained object.",
                "!type": "fn() -> ?"
            },
            "pop": "fn() -> ?",
            "push": "fn(newelt: ?) -> number",
            "reverse": "fn()",
            "shift": "fn() -> ?",
            "sort": "fn() -> !this",
            "splice": "fn(pos: number, amount: number)",
            "unshift": "fn(elt: ?) -> number",
            "concat": "fn(other: ?) -> !this",
            "join": "fn(separator?: string) -> string",
            "slice": "fn(from: number, to?: number) -> !this"
        },
        "random": {
            "!doc": "Return a random integer between min and max (inclusive).",
            "!type": "fn(min: number, max: number) -> number",
            "!url": "http://underscorejs.org/#random"
        },
        "range": {
            "!doc": "A function to create flexibly-numbered lists of integers.",
            "!type": "fn(start?: number, stop: number, step?: number) -> [number]",
            "!url": "http://underscorejs.org/#range"
        },
        "reduce": {
            "!doc": "reduce boils down a list of values into a single value.",
            "!type": "fn(list: [?], iterator: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?, context?: ?) -> !1.!ret",
            "!effects": ["call !1 this=!3 !2 !0.<i> number"],
            "!url": "http://underscorejs.org/#reduce"
        },
        "reduceRight": {
            "!doc": "The right-associative version of reduce, also known as `foldr`.",
            "!type": "fn(list: [?], iterator: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?, context?: ?) -> !1.!ret",
            "!effects": ["call !1 this=!3 !2 !0.<i> number"],
            "!url": "http://underscorejs.org/#reduceRight"
        },
        "reject": {
            "!doc": "Returns the values in list without the elements that the truth test (iterator) passes. The opposite of filter.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> bool, context?: ?) -> !0",
            "!effects": ["call !1 this=!3 !0.<i> number"],
            "!url": "http://underscorejs.org/#reject"
        },
        "rest": {
            "!doc": "Returns the rest of the elements in an array.",
            "!type": "fn(array: [?], n?: number) -> !0",
            "!url": "http://underscorejs.org/#rest"
        },
        "result": {
            "!doc": "If the value of the named `property` is a function then invoke it with the `object` as context; otherwise, return it.",
            "!type": "fn(object: ?, property: string) -> !0.<i>",
            "!url": "http://underscorejs.org/#result"
        },
        "select": "_.filter",
        "shuffle": {
            "!doc": "Shuffle an array.",
            "!type": "fn(list: [?]) -> !0",
            "!url": "http://underscorejs.org/#shuffle"
        },
        "size": {
            "!doc": "Return the number of elements in an object.",
            "!type": "fn(obj: ?) -> number",
            "!url": "http://underscorejs.org/#size"
        },
        "some": {
            "!doc": "Returns true if any of the values in the list pass the iterator truth test.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
            "!effects": ["call !1 this=!2 !0.<i> number"],
            "!url": "http://underscorejs.org/#some"
        },
        "sortBy": {
            "!doc": "Sort the object's values by a criterion produced by an iterator.",
            "!type": "fn(list: [?], iterator: fn(elt: ?, i: number) -> number, context?: ?) -> !0",
            "!url": "http://underscorejs.org/#sortBy"
        },
        "sortedIndex": {
            "!doc": "Use a comparator function to figure out the smallest index at which an object should be inserted so as to maintain order.",
            "!type": "fn(array: [?], obj: ?, iterator: fn(elt: ?, i: number), context?: ?) -> number",
            "!url": "http://underscorejs.org/#sortedIndex"
        },
        "tail": "_.rest",
        "take": "_.first",
        "tap": {
            "!doc": "Invokes interceptor with the obj, and then returns obj.",
            "!type": "fn(obj: ?, interceptor: fn()) -> !0",
            "!effects": ["call !1 !0"],
            "!url": "http://underscorejs.org/#tap"
        },
        "template": {
            "!doc": "Compiles JavaScript templates into functions that can be evaluated for rendering. ",
            "!type": "fn(text: string, data?: ?, settings?: _.templateSettings) -> fn(data: ?) -> string",
            "!url": "http://underscorejs.org/#template"
        },
        "templateSettings": {
            "!doc": "By default, Underscore uses ERB-style template delimiters, change the following template settings to use alternative delimiters.",
            "escape": "+RegExp",
            "evaluate": "+RegExp",
            "interpolate": "+RegExp",
            "!url": "http://underscorejs.org/#templateSettings"
        },
        "throttle": {
            "!doc": "Returns a function, that, when invoked, will only be triggered at most once during a given window of time.",
            "!type": "fn(func: fn(), wait: number, options?: ?) -> !0",
            "!url": "http://underscorejs.org/#throttle"
        },
        "times": {
            "!doc": "Run a function n times.",
            "!type": "fn(n: number, iterator: fn(), context?: ?) -> [!1.!ret]",
            "!url": "http://underscorejs.org/#times"
        },
        "toArray": {
            "!doc": "Safely create a real, live array from anything iterable.",
            "!type": "fn(obj: ?) -> [?]",
            "!url": "http://underscorejs.org/#toArray"
        },
        "unescape": {
            "!doc": "The opposite of escape.",
            "!type": "fn(string) -> string",
            "!url": "http://underscorejs.org/#unescape"
        },
        "union": {
            "!doc": "Produce an array that contains the union: each distinct element from all of the passed-in arrays.",
            "!type": "fn(array: [?], array2: [?]) -> ?0",
            "!url": "http://underscorejs.org/#union"
        },
        "uniq": {
            "!doc": "Produce a duplicate-free version of the array.",
            "!type": "fn(array: [?], isSorted?: bool, iterator?: fn(elt: ?, i: number), context?: ?) -> [?]",
            "!url": "http://underscorejs.org/#uniq"
        },
        "unique": "_.uniq",
        "uniqueId": {
            "!doc": "Generate a unique integer id (unique within the entire client session). Useful for temporary DOM ids.",
            "!type": "fn(prefix: string) -> string",
            "!url": "http://underscorejs.org/#uniqueId"
        },
        "values": {
            "!doc": "Retrieve the values of an object's properties.",
            "!type": "fn(obj: ?) -> [!0.<i>]",
            "!url": "http://underscorejs.org/#values"
        },
        "where": {
            "!doc": "Looks through each value in the list, returning an array of all the values that contain all of the key-value pairs listed in properties.",
            "!type": "fn(list: [?], attrs: ?) -> !0",
            "!url": "http://underscorejs.org/#where"
        },
        "without": {
            "!doc": "Return a version of the array that does not contain the specified value(s).",
            "!type": "fn(array: [?], values: [?]) -> !0",
            "!url": "http://underscorejs.org/#without"
        },
        "wrap": {
            "!doc": "Returns the first function passed as an argument to the second, allowing you to adjust arguments, run code before and after, and conditionally execute the original function.",
            "!type": "fn(func: fn(), wrapper: fn(?)) -> !0",
            "!effects": ["call !1 !0"],
            "!url": "http://underscorejs.org/#wrap"
        },
        "zip": {
            "!doc": "Zip together multiple lists into a single array -- elements that share an index go together.",
            "!type": "fn(array1: [?], array2: [?]) -> [?]",
            "!url": "http://underscorejs.org/#zip"
        }
    }
};

//#endregion


//#region tern/defs/ecma6.json

var def_ecma6 = {
  "!name": "ecma6",
  "!define": {
    "Promise.prototype": {
      "catch": {
        "!doc": "The catch() method returns a Promise and deals with rejected cases only. It behaves the same as calling Promise.prototype.then(undefined, onRejected).",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/catch",
        "!type": "fn(onRejected: fn(reason: ?))"
      },
      "then": {
        "!doc": "The then() method returns a Promise. It takes two arguments, both are callback functions for the success and failure cases of the Promise.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then",
        "!type": "fn(onFulfilled: fn(value: ?), onRejected: fn(reason: ?))",
        "!effects": [
          "call !0 !this.value"
        ]
      }
    },
    "promiseReject": {
      "!type": "fn(reason: ?)"
    }
  },
  "Array": {
    "from": {
      "!type": "fn(arrayLike: [], mapFn?: fn(), thisArg?: ?) -> !custom:Array_ctor",
      "!doc": "The Array.from() method creates a new Array instance from an array-like or iterable object.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from"
    },
    "of": {
      "!type": "fn(elementN: ?) -> !custom:Array_ctor",
      "!doc": "The Array.of() method creates a new Array instance with a variable number of arguments, regardless of number or type of the arguments.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/of"
    },
    "prototype": {
      "copyWithin": {
        "!type": "fn(target: number, start: number, end?: number) -> !custom:Array_ctor",
        "!doc": "The copyWithin() method copies the sequence of array elements within the array to the position starting at target. The copy is taken from the index positions of the second and third arguments start and end. The end argument is optional and defaults to the length of the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/copyWithin"
      },
      "entries": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The entries() method returns a new Array Iterator object that contains the key/value pairs for each index in the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/entries"
      },
      "fill": {
        "!type": "fn(value: ?, start?: number, end?: number)",
        "!doc": "The fill() method fills all the elements of an array from a start index to an end index with a static value.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/fill"
      },
      "find": {
        "!type": "fn(callback: fn(element: ?, index: number, array: []), thisArg?: ?) -> ?",
        "!doc": "The find() method returns a value in the array, if an element in the array satisfies the provided testing function. Otherwise undefined is returned.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find"
      },
      "findIndex": {
        "!type": "fn(callback: fn(element: ?, index: number, array: []), thisArg?: ?) -> number",
        "!doc": "The findIndex() method returns an index in the array, if an element in the array satisfies the provided testing function. Otherwise -1 is returned.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findIndex"
      },
      "keys": {
        "!type": "fn() -> !custom:Array_ctor",
        "!doc": "The keys() method returns a new Array Iterator that contains the keys for each index in the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/keys"
      },
      "values": {
        "!type": "fn() -> !custom:Array_ctor",
        "!doc": "The values() method returns a new Array Iterator object that contains the values for each index in the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/values"
      }
    }
  },
  "ArrayBuffer": {
    "!type": "fn(length: number)",
    "!doc": "The ArrayBuffer object is used to represent a generic, fixed-length raw binary data buffer. You can not directly manipulate the contents of an ArrayBuffer; instead, you create one of the typed array objects or a DataView object which represents the buffer in a specific format, and use that to read and write the contents of the buffer.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer",
    "isView": {
      "!type": "fn(arg: ?) -> bool",
      "!doc": "The ArrayBuffer.isView() method returns true if arg is a view one of the ArrayBuffer views, such as typed array objects or a DataView; false otherwise.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/isView"
    },
    "transfer": {
      "!type": "fn(oldBuffer: ?, newByteLength: ?)",
      "!doc": "The static ArrayBuffer.transfer() method returns a new ArrayBuffer whose contents are taken from the oldBuffer's data and then is either truncated or zero-extended by newByteLength. If newByteLength is undefined, the byteLength of the oldBuffer is used. This operation leaves oldBuffer in a detached state.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/transfer"
    },
    "prototype": {
      "byteLength": {
        "!type": "number",
        "!doc": "The byteLength accessor property represents the length of an ArrayBuffer in bytes.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/byteLength"
      },
      "slice": {
        "!type": "fn(begin: number, end?: number) -> +ArrayBuffer",
        "!doc": "The slice() method returns a new ArrayBuffer whose contents are a copy of this ArrayBuffer's bytes from begin, inclusive, up to end, exclusive.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/ArrayBuffer/slice"
      }
    }
  },
  "DataView": {
    "!type": "fn(buffer: +ArrayBuffer, byteOffset?: number, byteLength?: number)",
    "!doc": "The DataView view provides a low-level interface for reading data from and writing it to an ArrayBuffer.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView",
    "prototype": {
      "buffer": {
        "!type": "+ArrayBuffer",
        "!doc": "The buffer accessor property represents the ArrayBuffer referenced by the DataView at construction time.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/buffer"
      },
      "byteLength": {
        "!type": "number",
        "!doc": "The byteLength accessor property represents the length (in bytes) of this view from the start of its ArrayBuffer.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/byteLength"
      },
      "byteOffset": {
        "!type": "number",
        "!doc": "The byteOffset accessor property represents the offset (in bytes) of this view from the start of its ArrayBuffer.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/byteOffset"
      },
      "getFloat32": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getFloat32() method gets a signed 32-bit integer (float) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getFloat32"
      },
      "getFloat64": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getFloat64() method gets a signed 64-bit float (double) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getFloat64"
      },
      "getInt16": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getInt16() method gets a signed 16-bit integer (short) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getInt16"
      },
      "getInt32": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getInt32() method gets a signed 32-bit integer (long) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getInt32"
      },
      "getInt8": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getInt8() method gets a signed 8-bit integer (byte) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getInt8"
      },
      "getUint16": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getUint16() method gets an unsigned 16-bit integer (unsigned short) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getUint16"
      },
      "getUint32": {
        "!type": "fn(byteOffset: number, littleEndian?: bool) -> number",
        "!doc": "The getUint32() method gets an unsigned 32-bit integer (unsigned long) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getUint32"
      },
      "getUint8": {
        "!type": "fn(byteOffset: number) -> number",
        "!doc": "The getUint8() method gets an unsigned 8-bit integer (unsigned byte) at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/getUint8"
      },
      "setFloat32": {
        "!type": "fn(byteOffset: number, value: number, littleEndian?: bool)",
        "!doc": "The setFloat32() method stores a signed 32-bit integer (float) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setFloat32"
      },
      "setFloat64": {
        "!type": "fn(byteOffset: number, value: number, littleEndian?: bool)",
        "!doc": "The setFloat64() method stores a signed 64-bit integer (double) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setFloat64"
      },
      "setInt16": {
        "!type": "fn(byteOffset: number, value: number, littleEndian?: bool)",
        "!doc": "The setInt16() method stores a signed 16-bit integer (short) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setInt16"
      },
      "setInt32": {
        "!type": "fn(byteOffset: number, value: number, littleEndian?: bool)",
        "!doc": "The setInt32() method stores a signed 32-bit integer (long) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setInt32"
      },
      "setInt8": {
        "!type": "fn(byteOffset: number, value: number)",
        "!doc": "The setInt8() method stores a signed 8-bit integer (byte) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setInt8"
      },
      "setUint16": {
        "!type": "fn(byteOffset: number, value: number, littleEndian?: bool)",
        "!doc": "The setUint16() method stores an unsigned 16-bit integer (unsigned short) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setUint16"
      },
      "setUint32": {
        "!type": "fn(byteOffset: number, value: number, littleEndian?: bool)",
        "!doc": "The setUint32() method stores an unsigned 32-bit integer (unsigned long) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setUint32"
      },
      "setUint8": {
        "!type": "fn(byteOffset: number, value: number)",
        "!doc": "The setUint8() method stores an unsigned 8-bit integer (byte) value at the specified byte offset from the start of the DataView.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView/setUint8"
      }
    }
  },
  "Float32Array": {
    "!type": "fn(length: number)",
    "!doc": "The Float32Array typed array represents an array of 32-bit floating point numbers (corresponding to the C float data type) in the platform byte order. If control over byte order is needed, use DataView instead. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Float32Array",
    "prototype": {
      "!proto": "TypedArray.prototype"
    },
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of"
  },
  "Float64Array": {
    "!type": "fn(length: number)",
    "!doc": "The Float64Array typed array represents an array of 64-bit floating point numbers (corresponding to the C double data type) in the platform byte order. If control over byte order is needed, use DataView instead. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Float64Array",
    "prototype": {
      "!proto": "TypedArray.prototype"
    },
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of"
  },
  "Int16Array": {
    "!type": "fn(length: number)",
    "!doc": "The Int16Array typed array represents an array of twos-complement 16-bit signed integers in the platform byte order. If control over byte order is needed, use DataView instead. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Int16Array",
    "prototype": {
      "!proto": "TypedArray.prototype"
    },
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of"
  },
  "Int32Array": {
    "!type": "fn(length: number)",
    "!doc": "The Int32Array typed array represents an array of twos-complement 32-bit signed integers in the platform byte order. If control over byte order is needed, use DataView instead. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Int32Array",
    "prototype": {
      "!proto": "TypedArray.prototype"
    },
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of"
  },
  "Int8Array": {
    "!type": "fn(length: number)",
    "!doc": "The Int8Array typed array represents an array of twos-complement 8-bit signed integers. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Int8Array",
    "prototype": {
      "!proto": "TypedArray.prototype"
    },
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of"
  },
  "Map": {
    "!type": "fn(iterable?: [])",
    "!doc": "The Map object is a simple key/value map. Any value (both objects and primitive values) may be used as either a key or a value.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map",
    "prototype": {
      "clear": {
        "!type": "fn()",
        "!doc": "The clear() method removes all elements from a Map object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/clear"
      },
      "delete": {
        "!type": "fn(key: ?)",
        "!doc": "The delete() method removes the specified element from a Map object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/delete"
      },
      "entries": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The entries() method returns a new Iterator object that contains the [key, value] pairs for each element in the Map object in insertion order.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/entries"
      },
      "forEach": {
        "!type": "fn(callback: fn(value: ?, key: ?, map: +Map), thisArg?: ?)",
        "!effects": ["call !0 this=!1 !this.<i> number !this"],
        "!doc": "The forEach() method executes a provided function once per each key/value pair in the Map object, in insertion order.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/forEach"
      },
      "get": {
        "!type": "fn(key: ?) -> !this.<i>",
        "!doc": "The get() method returns a specified element from a Map object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/get"
      },
      "has": {
        "!type": "fn(key: ?) -> bool",
        "!doc": "The has() method returns a boolean indicating whether an element with the specified key exists or not.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/has"
      },
      "keys": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The keys() method returns a new Iterator object that contains the keys for each element in the Map object in insertion order.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys"
      },
      "set": {
        "!type": "fn(key: ?, value: ?) -> !this",
        "!doc": "The set() method adds a new element with a specified key and value to a Map object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/set"
      },
      "size": {
        "!type": "number",
        "!doc": "The size accessor property returns the number of elements in a Map object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/size"
      },
      "values": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The values() method returns a new Iterator object that contains the values for each element in the Map object in insertion order.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values"
      },
      "prototype[@@iterator]": {
        "!type": "fn()",
        "!doc": "The initial value of the @@iterator property is the same function object as the initial value of the entries property.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/@@iterator"
      }
    }
  },
  "Math": {
    "acosh": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.acosh() function returns the hyperbolic arc-cosine of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/acosh"
    },
    "asinh": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.asinh() function returns the hyperbolic arcsine of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/asinh"
    },
    "atanh": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.atanh() function returns the hyperbolic arctangent of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/atanh"
    },
    "cbrt": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.cbrt() function returns the cube root of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/cbrt"
    },
    "clz32": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.clz32() function returns the number of leading zero bits in the 32-bit binary representation of a number.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32"
    },
    "cosh": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.cosh() function returns the hyperbolic cosine of a number, that can be expressed using the constant e:",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/cosh"
    },
    "expm1": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.expm1() function returns ex - 1, where x is the argument, and e the base of the natural logarithms.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/expm1"
    },
    "fround": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.fround() function returns the nearest single precision float representation of a number.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround"
    },
    "hypot": {
      "!type": "fn(value: number) -> number",
      "!doc": "The Math.hypot() function returns the square root of the sum of squares of its arguments, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/hypot"
    },
    "imul": {
      "!type": "fn(a: number, b: number) -> number",
      "!doc": "The Math.imul() function returns the result of the C-like 32-bit multiplication of the two parameters.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul"
    },
    "log10": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.log10() function returns the base 10 logarithm of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log10"
    },
    "log1p": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.log1p() function returns the natural logarithm (base e) of 1 + a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log1p"
    },
    "log2": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.log2() function returns the base 2 logarithm of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/log2"
    },
    "sign": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.sign() function returns the sign of a number, indicating whether the number is positive, negative or zero.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sign"
    },
    "sinh": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.sinh() function returns the hyperbolic sine of a number, that can be expressed using the constant e:",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/sinh"
    },
    "tanh": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.tanh() function returns the hyperbolic tangent of a number, that is",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/tanh"
    },
    "trunc": {
      "!type": "fn(x: number) -> number",
      "!doc": "The Math.trunc() function returns the integral part of a number by removing any fractional digits. It does not round any numbers. The function can be expressed with the floor() and ceil() function:",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc"
    }
  },
  "Number": {
    "EPSILON": {
      "!type": "number",
      "!doc": "The Number.EPSILON property represents the difference between one and the smallest value greater than one that can be represented as a Number.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON"
    },
    "MAX_SAFE_INTEGER": {
      "!type": "number",
      "!doc": "The Number.MAX_SAFE_INTEGER constant represents the maximum safe integer in JavaScript (253 - 1).",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER"
    },
    "MIN_SAFE_INTEGER": {
      "!type": "number",
      "!doc": "The Number.MIN_SAFE_INTEGER constant represents the minimum safe integer in JavaScript (-(253 - 1)).",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MIN_SAFE_INTEGER"
    },
    "isFinite": {
      "!type": "fn(testValue: ?) -> bool",
      "!doc": "The Number.isFinite() method determines whether the passed value is finite.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite"
    },
    "isInteger": {
      "!type": "fn(testValue: ?) -> bool",
      "!doc": "The Number.isInteger() method determines whether the passed value is an integer.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger"
    },
    "isNaN": {
      "!type": "fn(testValue: ?) -> bool",
      "!doc": "The Number.isNaN() method determines whether the passed value is NaN. More robust version of the original global isNaN().",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isNaN"
    },
    "isSafeInteger": {
      "!type": "fn(testValue: ?) -> bool",
      "!doc": "The Number.isSafeInteger() method determines whether the provided value is a number that is a safe integer. A safe integer is an integer that",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger"
    },
    "parseFloat": {
      "!type": "fn(string: string) -> number",
      "!doc": "The Number.parseFloat() method parses a string argument and returns a floating point number. This method behaves identically to the global function parseFloat() and is part of ECMAScript 6 (its purpose is modularization of globals).",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/parseFloat"
    },
    "parseInt": {
      "!type": "fn(string: string, radix?: number) -> number",
      "!doc": "The Number.parseInt() method parses a string argument and returns an integer of the specified radix or base. This method behaves identically to the global function parseInt() and is part of ECMAScript 6 (its purpose is modularization of globals).",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/parseInt"
    }
  },
  "Object": {
    "assign": {
      "!type": "fn(target: ?, sources: ?) -> ?",
      "!doc": "The Object.assign() method is used to copy the values of all enumerable own properties from one or more source objects to a target object. It will return the target object.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign"
    },
    "getOwnPropertySymbols": {
      "!type": "fn(obj: ?) -> [?]",
      "!doc": "The Object.getOwnPropertySymbols() method returns an array of all symbol properties found directly upon a given object.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertySymbols"
    },
    "is": {
      "!type": "fn(value1: ?, value2: ?) -> bool",
      "!doc": "The Object.is() method determines whether two values are the same value.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is"
    },
    "setPrototypeOf": {
      "!type": "fn(obj: ?, prototype: ?)",
      "!doc": "The Object.setPrototype() method sets the prototype (i.e., the internal [[Prototype]] property) of a specified object to another object or null.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/setPrototypeOf"
    }
  },
  "Promise": {
    "!type": "fn(executor: fn(resolve: fn(value: ?), reject: promiseReject)) -> !custom:Promise_ctor",
    "!doc": "The Promise object is used for deferred and asynchronous computations. A Promise is in one of the three states:",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise",
    "all": {
      "!type": "fn(iterable: [+Promise]) -> !0.<i>",
      "!doc": "The Promise.all(iterable) method returns a promise that resolves when all of the promises in the iterable argument have resolved.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all"
    },
    "race": {
      "!type": "fn(iterable: [+Promise]) -> !0.<i>",
      "!doc": "The Promise.race(iterable) method returns a promise that resolves or rejects as soon as one of the promises in the iterable resolves or rejects, with the value or reason from that promise.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race"
    },
    "reject": {
      "!type": "fn(reason: ?) -> !this",
      "!doc": "The Promise.reject(reason) method returns a Promise object that is rejected with the given reason.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/reject"
    },
    "resolve": {
      "!type": "fn(value: ?) -> +Promise[value=!0]",
      "!doc": "The Promise.resolve(value) method returns a Promise object that is resolved with the given value. If the value is a thenable (i.e. has a then method), the returned promise will 'follow' that thenable, adopting its eventual state; otherwise the returned promise will be fulfilled with the value.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/resolve"
    },
    "prototype": "Promise.prototype"
  },
  "Proxy": {
    "!type": "fn(target: ?, handler: ?)",
    "!doc": "The Proxy object is used to define the custom behavior in JavaScript fundamental operation (e.g. property lookup, assignment, enumeration, function invocation, etc).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy",
    "revocable": {
      "!doc": "The Proxy.revocable() method is used to create a revocable Proxy object.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/revocable"
    }
  },
  "RegExp": {    
    "prototype": {
      "flags": {
        "!type": "string",
        "!doc": "The flags property returns a string consisting of the flags of the current regular expression object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/flags"
      },
      "sticky": {
        "!type": "bool",
        "!doc": "The sticky property reflects whether or not the search is sticky (searches in strings only from the index indicated by the lastIndex property of this regular expression). sticky is a read-only property of an individual regular expression object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/sticky"
      }
    }
  },
  "Set": {
    "!type": "fn(iterable: [?])",
    "!doc": "The Set object lets you store unique values of any type, whether primitive values or object references.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set",
    "length": {
      "!type": "number",
      "!doc": "The value of the length property is 1."
    },
    "prototype": {
      "add": {
        "!type": "fn(value: ?) -> !this",
        "!doc": "The add() method appends a new element with a specified�value to the end of a Set object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/add"
      },
      "clear": {
        "!type": "fn()",
        "!doc": "The clear() method removes all elements from a Set object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/clear"
      },
      "delete": {
        "!type": "fn(value: ?) -> bool",
        "!doc": "The delete() method removes the specified element from a Set object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/delete"
      },
      "entries": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The entries() method returns a new Iterator object that contains an array of [value, value] for each element in the Set object, in insertion order. For Set objects there is no key like in Map objects. However, to keep the API similar to the Map object, each entry has the same value for its key and value here, so that an array [value, value] is returned.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/entries"
      },
      "forEach": {
        "!type": "fn(callback: fn(value: ?, value2: ?, set: +Set), thisArg?: ?)",
        "!effects": ["call !0 this=!1 !this.<i> number !this"]
      },
      "has": {
        "!type": "fn(value: ?) -> bool",
        "!doc": "The has() method returns a boolean indicating whether an element with the specified value exists in a Set object or not.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/has"
      },
      "keys": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The values() method returns a new Iterator object that contains the values for each element in the Set object in insertion order.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/keys"
      },
      "size": {
        "!type": "number",
        "!doc": "The size accessor property returns the number of elements in a Set object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/size"
      },
      "values": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The values() method returns a new Iterator object that contains the values for each element in the Set object in insertion order.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/values"
      },
      "prototype[@@iterator]": {
        "!type": "fn()",
        "!doc": "The initial value of the @@iterator property is the same function object as the initial value of the values property.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/@@iterator"
      }
    }
  },
  "String": {
    "fromCodePoint": {
      "!type": "fn(num1: ?) -> string",
      "!doc": "The static String.fromCodePoint() method returns a string created by using the specified sequence of code points.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/fromCodePoint"
    },
    "raw": {
      "!type": "fn(callSite: ?, substitutions: ?, templateString: ?) -> string",
      "!doc": "The static String.raw() method is a tag function of template strings, like the r prefix in Python or the @ prefix in C# for string literals, this function is used to get the raw string form of template strings.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/raw"
    },
    "prototype": {
      "codePointAt": {
        "!type": "fn(pos: number) -> number",
        "!doc": "The codePointAt() method returns a non-negative integer that is the UTF-16 encoded code point value.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/codePointAt"
      },
      "endsWith": {
        "!type": "fn(searchString: string, position?: number) -> bool",
        "!doc": "The endsWith() method determines whether a string ends with the characters of another string, returning true or false as appropriate.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith"
      },
      "includes": {
        "!type": "fn(searchString: string, position?: number) -> bool",
        "!doc": "The includes() method determines whether one string may be found within another string, returning true or false as appropriate.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/contains"
      },
      "normalize": {
        "!type": "fn(form: string) -> string",
        "!doc": "The normalize() method returns the Unicode Normalization Form of a given string (if the value isn't a string, it will be converted to one first).",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize"
      },
      "repeat": {
        "!type": "fn(count: number) -> string",
        "!doc": "The repeat() method constructs and returns a new string which contains the specified number of copies of the string on which it was called, concatenated together.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat"
      },
      "startsWith": {
        "!type": "fn(searchString: string, position?: number) -> bool",
        "!doc": "The startsWith() method determines whether a string begins with the characters of another string, returning true or false as appropriate.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith"
      }
    }
  },
  "Symbol": {
    "!type": "fn(description?: string)",
    "!doc": "A symbol is a unique and immutable data type and may be used as an identifier for object properties. The symbol object is an implicit object wrapper for the symbol primitive data type.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol",
    "for": {
      "!type": "fn(key: string) -> +Symbol",
      "!doc": "The Symbol.for(key) method searches for existing symbols in a runtime-wide symbol registry with the given key and returns it if found. Otherwise a new symbol gets created in the global symbol registry with this key.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/for"
    },
    "keyFor": {
      "!type": "fn(sym: +Symbol) -> +Symbol",
      "!doc": "The Symbol.keyFor(sym) method retrieves a shared symbol key from the global symbol registry for the given symbol.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/keyFor"
    },
    "prototype": {
      "toString": {
        "!type": "fn() -> string",
        "!doc": "The toString() method returns a string representing the specified Symbol object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toString"
      },
      "valueOf": {
        "!type": "fn() -> ?",
        "!doc": "The valueOf() method returns the primitive value of a Symbol object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/valueOf"
      }
    }
  },
  "TypedArray": {
    "!type": "fn(length: number)",
    "!doc": "A TypedArray object describes an array-like view of an underlying binary data buffer. There is no global property named TypedArray, nor is there a directly visible TypedArray constructor.  Instead, there are a number of different global properties, whose values are typed array constructors for specific element types, listed below. On the following pages you will find common properties and methods that can be used with any typed array containing elements of any type.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray",
    "BYTES_PER_ELEMENT": {
      "!type": "number",
      "!doc": "The TypedArray.BYTES_PER_ELEMENT property represents the size in bytes of each element in an typed array.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/BYTES_PER_ELEMENT"
    },
    "length": {
      "!type": "number",
      "!doc": "The length accessor property represents the length (in elements) of a typed array.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/length"
    },
    "name": {
      "!type": "string",
      "!doc": "The TypedArray.name property represents a string value of the typed array constructor name.",
      "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/name"
    },
    "prototype": {
      "buffer": {
        "!type": "+ArrayBuffer",
        "!doc": "The buffer accessor property represents the ArrayBuffer referenced by a TypedArray at construction time.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/buffer"
      },
      "byteLength": {
        "!type": "number",
        "!doc": "The byteLength accessor property represents the length (in bytes) of a typed array from the start of its ArrayBuffer.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/byteLength"
      },
      "byteOffset": {
        "!type": "number",
        "!doc": "The byteOffset accessor property represents the offset (in bytes) of a typed array from the start of its ArrayBuffer.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/byteOffset"
      },
      "copyWithin": {
        "!type": "fn(target: number, start: number, end?: number) -> ?",
        "!doc": "The copyWithin() method copies the sequence of array elements within the array to the position starting at target. The copy is taken from the index positions of the second and third arguments start and end. The end argument is optional and defaults to the length of the array. This method has the same algorithm as Array.prototype.copyWithin. TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/copyWithin"
      },
      "entries": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The entries() method returns a new Array Iterator object that contains the key/value pairs for each index in the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/entries"
      },
      "every": {
        "!type": "fn(callback: fn(currentValue: ?, index: number, array: +TypedArray) -> bool, thisArg?: ?) -> bool",
        "!effects": [
          "call !0 this=!1 !this.<i> number !this"
        ],
        "!doc": "The every() method tests whether all elements in the typed array pass the test implemented by the provided function. This method has the same algorithm as Array.prototype.every(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/every"
      },
      "fill": {
        "!type": "fn(value: ?, start?: number, end?: number)",
        "!doc": "The fill() method fills all the elements of a typed array from a start index to an end index with a static value. This method has the same algorithm as Array.prototype.fill(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/fill"
      },
      "filter": {
        "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> !this",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!doc": "Creates a new array with all of the elements of this array for which the provided filtering function returns true. See also Array.prototype.filter().",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/filter"
      },
      "find": {
        "!type": "fn(callback: fn(element: ?, index: number, array: +TypedArray) -> bool, thisArg?: ?) -> ?",
        "!effects": [
          "call !0 this=!1 !this.<i> number !this"
        ],
        "!doc": "The find() method returns a value in the typed array, if an element satisfies the provided testing function. Otherwise undefined is returned. TypedArray is one of the typed array types here.\nSee also the findIndex() method, which returns the index of a found element in the typed array instead of its value.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/find"
      },
      "findIndex": {
        "!type": "fn(callback: fn(element: ?, index: number, array: +TypedArray) -> bool, thisArg?: ?) -> number",
        "!effects": [
          "call !0 this=!1 !this.<i> number !this"
        ],
        "!doc": "The findIndex() method returns an index in the typed array, if an element in the typed array satisfies the provided testing function. Otherwise -1 is returned.\nSee also the find() method, which returns the value of a found element in the typed array instead of its index.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/findIndex"
      },
      "forEach": {
        "!type": "fn(callback: fn(value: ?, key: ?, array: +TypedArray), thisArg?: ?)",
        "!effects": ["call !0 this=!1 !this.<i> number !this"],
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/forEach"
      },
      "includes": {
        "!type": "fn(searchElement: ?, fromIndex?: number) -> bool",
        "!doc": "The includes() method determines whether a typed array includes a certain element, returning true or false as appropriate. This method has the same algorithm as Array.prototype.includes(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/includes"
      },
      "indexOf": {
        "!type": "fn(searchElement: ?, fromIndex?: number) -> number",
        "!doc": "The indexOf() method returns the first index at which a given element can be found in the typed array, or -1 if it is not present. This method has the same algorithm as Array.prototype.indexOf(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/indexOf"
      },
      "join": {
        "!type": "fn(separator?: string) -> string",
        "!doc": "The join() method joins all elements of an array into a string. This method has the same algorithm as Array.prototype.join(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/join"
      },
      "keys": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The keys() method returns a new Array Iterator object that contains the keys for each index in the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/keys"
      },
      "lastIndexOf": {
        "!type": "fn(searchElement: ?, fromIndex?: number) -> number",
        "!doc": "The lastIndexOf() method returns the last index at which a given element can be found in the typed array, or -1 if it is not present. The typed array is searched backwards, starting at fromIndex. This method has the same algorithm as Array.prototype.lastIndexOf(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/lastIndexOf"
      },
      "length": {
        "!type": "number",
        "!doc": "Returns the number of elements hold in the typed array. Fixed at construction time and thus read only.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/length"
      },
      "map": {
        "!type": "fn(f: fn(elt: ?, i: number) -> ?, context?: ?) -> [!0.!ret]",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!doc": "Creates a new array with the results of calling a provided function on every element in this array. See also Array.prototype.map().",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/map"
      },
      "reduce": {
        "!type": "fn(combine: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?) -> !0.!ret",
        "!effects": [
          "call !0 !1 !this.<i> number"
        ],
        "!doc": "Apply a function against an accumulator and each value of the array (from left-to-right) as to reduce it to a single value. See also Array.prototype.reduce().",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/reduce"
      },
      "reduceRight": {
        "!type": "fn(combine: fn(sum: ?, elt: ?, i: number) -> ?, init?: ?) -> !0.!ret",
        "!effects": [
          "call !0 !1 !this.<i> number"
        ],
        "!doc": "Apply a function against an accumulator and each value of the array (from right-to-left) as to reduce it to a single value. See also Array.prototype.reduceRight().",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/reduceRight"
      },
      "reverse": {
        "!type": "fn()",
        "!doc": "The reverse() method reverses a typed array in place. The first typed array element becomes the last and the last becomes the first. This method has the same algorithm as Array.prototype.reverse(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/reverse"
      },
      "set": {
        "!type": "fn(array: [?], offset?: ?)",
        "!doc": "The set() method stores multiple values in the typed array, reading input values from a specified array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/set"
      },
      "slice": {
        "!type": "fn(from: number, to?: number) -> !this",
        "!type": "Extracts a section of an array and returns a new array. See also Array.prototype.slice().",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/slice"
      },
      "some": {
        "!type": "fn(test: fn(elt: ?, i: number) -> bool, context?: ?) -> bool",
        "!effects": [
          "call !0 this=!1 !this.<i> number"
        ],
        "!doc": "The some() method tests whether some element in the typed array passes the test implemented by the provided function. This method has the same algorithm as Array.prototype.some(). TypedArray is one of the typed array types here.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/some"
      },
      "sort": {
        "!type": "fn(compare?: fn(a: ?, b: ?) -> number)",
        "!effects": [
          "call !0 !this.<i> !this.<i>"
        ],
        "!doc": "Sorts the elements of an array in place and returns the array. See also Array.prototype.sort().",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/sort"
      },
      "subarray": {
        "!type": "fn(begin?: number, end?: number) -> +TypedArray",
        "!doc": "The subarray() method returns a new TypedArray on the same ArrayBuffer store and with the same element types as for this TypedArray object. The begin offset is inclusive and the end offset is exclusive. TypedArray is one of the typed array types.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/subarray"
      },
      "values": {
        "!type": "fn() -> TODO_ITERATOR",
        "!doc": "The values() method returns a new Array Iterator object that contains the values for each index in the array.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/values"
      },
      "prototype[@@iterator]": {
        "!type": "fn()",
        "!doc": "The initial value of the @@iterator property is the same function object as the initial value of the values property.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray/@@iterator"
      }
    }
  },
  "Uint16Array": {
    "!type": "fn()",
    "!doc": "The Uint16Array typed array represents an array of 16-bit unsigned integers in the platform byte order. If control over byte order is needed, use DataView instead. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint16Array",
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of",
    "prototype": {
      "!proto": "TypedArray.prototype"
    }
  },
  "Uint32Array": {
    "!type": "fn()",
    "!doc": "The Uint32Array typed array represents an array of 32-bit unsigned integers in the platform byte order. If control over byte order is needed, use DataView instead. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint32Array",
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of",
    "prototype": {
      "!proto": "TypedArray.prototype"
    }
  },
  "Uint8Array": {
    "!type": "fn()",
    "!doc": "The Uint8Array typed array represents an array of 8-bit unsigned integers. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array",
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of",
    "prototype": {
      "!proto": "TypedArray.prototype"
    }
  },
  "Uint8ClampedArray": {
    "!type": "fn()",
    "!doc": "The Uint8ClampedArray typed array represents an array of 8-bit unsigned integers clamped to 0-255. The contents are initialized to 0. Once established, you can reference elements in the array using the object's methods, or using standard array index syntax (that is, using bracket notation).",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray",
    "length": "TypedArray.length",
    "BYTES_PER_ELEMENT": "TypedArray.BYTES_PER_ELEMENT",
    "name": "TypedArray.name",
    "from": "TypedArray.from",
    "of": "TypedArray.of",
    "prototype": {
      "!proto": "TypedArray.prototype"
    }
  },
  "WeakMap": {
    "!type": "fn(iterable: [?])",
    "!doc": "The WeakMap object is a collection of key/value pairs in which the keys are objects and the values can be arbitrary values.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap",
    "prototype": {
      "delete": {
        "!type": "fn(key: ?) -> bool",
        "!doc": "The delete() method removes the specified element from a WeakMap object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/delete"
      },
      "get": {
        "!type": "fn(key: ?) !this.<i>",
        "!doc": "The get() method returns a specified element from a WeakMap object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/get"
      },
      "has": {
        "!type": "fn(key: ?) -> bool",
        "!doc": "The has() method returns a boolean indicating whether an element with the specified key exists in the WeakMap object or not.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/has"
      },
      "set": {
        "!type": "fn(key: ?, value: ?)",
        "!doc": "The set() method adds a new element with a specified key and value to a WeakMap object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap/set"
      }
    }
  },
  "WeakSet": {
    "!type": "fn(iterable: [?])",
    "!doc": "The WeakSet object lets you store weakly held objects in a collection.",
    "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet",
    "prototype": {
      "add": {
        "!type": "fn(value: ?)",
        "!doc": "The add() method appends a new object to the end of a WeakSet object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/add"
      },
      "delete": {
        "!type": "fn(value: ?) -> bool",
        "!doc": "The delete() method removes the specified element from a WeakSet object.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/delete"
      },
      "has": {
        "!type": "fn(value: ?) -> bool",
        "!doc": "The has() method returns a boolean indicating whether an object exists in a WeakSet or not.",
        "!url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet/has"
      }
    }
  }
};

//#endregion
