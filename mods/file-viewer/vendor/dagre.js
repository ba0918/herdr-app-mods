// dagre のグラフ配置（layout）と graphlib（Graph）を 1 つの ES モジュールにまとめたもの。生成物なので手で編集しない。
// 元: npm の dagre-d3-es 7.0.14（src/dagre と src/graphlib、MIT）と lodash-es 4.18.1（MIT）を bun build で束ねた。
//   entry: export { layout } from "dagre-d3-es/src/dagre/index.js"; export { Graph } from "dagre-d3-es/src/graphlib/index.js";
//   bun build entry.js --format esm --target browser
// 変更点は 1 か所: lodash の Function("return this")() を globalThis にした（mod の実行環境は Function コンストラクタを禁じている）。
// ライセンス表記は ../THIRD-PARTY-NOTICES にある。
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isBuffer.js
var exports_isBuffer = {};
__export(exports_isBuffer, {
  default: () => isBuffer_default
});

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_nodeUtil.js
var exports__nodeUtil = {};
__export(exports__nodeUtil, {
  default: () => _nodeUtil_default
});

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneBuffer.js
var exports__cloneBuffer = {};
__export(exports__cloneBuffer, {
  default: () => _cloneBuffer_default
});

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_freeGlobal.js
var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
var _freeGlobal_default = freeGlobal;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_root.js
var freeSelf = typeof self == "object" && self && self.Object === Object && self;
var root = _freeGlobal_default || freeSelf || globalThis;
var _root_default = root;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Symbol.js
var Symbol2 = _root_default.Symbol;
var _Symbol_default = Symbol2;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getRawTag.js
var objectProto = Object.prototype;
var hasOwnProperty = objectProto.hasOwnProperty;
var nativeObjectToString = objectProto.toString;
var symToStringTag = _Symbol_default ? _Symbol_default.toStringTag : undefined;
function getRawTag(value) {
  var isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
  try {
    value[symToStringTag] = undefined;
    var unmasked = true;
  } catch (e) {}
  var result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}
var _getRawTag_default = getRawTag;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_objectToString.js
var objectProto2 = Object.prototype;
var nativeObjectToString2 = objectProto2.toString;
function objectToString(value) {
  return nativeObjectToString2.call(value);
}
var _objectToString_default = objectToString;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseGetTag.js
var nullTag = "[object Null]";
var undefinedTag = "[object Undefined]";
var symToStringTag2 = _Symbol_default ? _Symbol_default.toStringTag : undefined;
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return symToStringTag2 && symToStringTag2 in Object(value) ? _getRawTag_default(value) : _objectToString_default(value);
}
var _baseGetTag_default = baseGetTag;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isObjectLike.js
function isObjectLike(value) {
  return value != null && typeof value == "object";
}
var isObjectLike_default = isObjectLike;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isSymbol.js
var symbolTag = "[object Symbol]";
function isSymbol(value) {
  return typeof value == "symbol" || isObjectLike_default(value) && _baseGetTag_default(value) == symbolTag;
}
var isSymbol_default = isSymbol;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayMap.js
function arrayMap(array, iteratee) {
  var index = -1, length = array == null ? 0 : array.length, result = Array(length);
  while (++index < length) {
    result[index] = iteratee(array[index], index, array);
  }
  return result;
}
var _arrayMap_default = arrayMap;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isArray.js
var isArray = Array.isArray;
var isArray_default = isArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseToString.js
var INFINITY = 1 / 0;
var symbolProto = _Symbol_default ? _Symbol_default.prototype : undefined;
var symbolToString = symbolProto ? symbolProto.toString : undefined;
function baseToString(value) {
  if (typeof value == "string") {
    return value;
  }
  if (isArray_default(value)) {
    return _arrayMap_default(value, baseToString) + "";
  }
  if (isSymbol_default(value)) {
    return symbolToString ? symbolToString.call(value) : "";
  }
  var result = value + "";
  return result == "0" && 1 / value == -INFINITY ? "-0" : result;
}
var _baseToString_default = baseToString;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_trimmedEndIndex.js
var reWhitespace = /\s/;
function trimmedEndIndex(string) {
  var index = string.length;
  while (index-- && reWhitespace.test(string.charAt(index))) {}
  return index;
}
var _trimmedEndIndex_default = trimmedEndIndex;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseTrim.js
var reTrimStart = /^\s+/;
function baseTrim(string) {
  return string ? string.slice(0, _trimmedEndIndex_default(string) + 1).replace(reTrimStart, "") : string;
}
var _baseTrim_default = baseTrim;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isObject.js
function isObject(value) {
  var type = typeof value;
  return value != null && (type == "object" || type == "function");
}
var isObject_default = isObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/toNumber.js
var NAN = 0 / 0;
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
var reIsBinary = /^0b[01]+$/i;
var reIsOctal = /^0o[0-7]+$/i;
var freeParseInt = parseInt;
function toNumber(value) {
  if (typeof value == "number") {
    return value;
  }
  if (isSymbol_default(value)) {
    return NAN;
  }
  if (isObject_default(value)) {
    var other = typeof value.valueOf == "function" ? value.valueOf() : value;
    value = isObject_default(other) ? other + "" : other;
  }
  if (typeof value != "string") {
    return value === 0 ? value : +value;
  }
  value = _baseTrim_default(value);
  var isBinary = reIsBinary.test(value);
  return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
}
var toNumber_default = toNumber;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/toFinite.js
var INFINITY2 = 1 / 0;
var MAX_INTEGER = 179769313486231570000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000;
function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber_default(value);
  if (value === INFINITY2 || value === -INFINITY2) {
    var sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}
var toFinite_default = toFinite;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/toInteger.js
function toInteger(value) {
  var result = toFinite_default(value), remainder = result % 1;
  return result === result ? remainder ? result - remainder : result : 0;
}
var toInteger_default = toInteger;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/identity.js
function identity(value) {
  return value;
}
var identity_default = identity;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isFunction.js
var asyncTag = "[object AsyncFunction]";
var funcTag = "[object Function]";
var genTag = "[object GeneratorFunction]";
var proxyTag = "[object Proxy]";
function isFunction(value) {
  if (!isObject_default(value)) {
    return false;
  }
  var tag = _baseGetTag_default(value);
  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
}
var isFunction_default = isFunction;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_coreJsData.js
var coreJsData = _root_default["__core-js_shared__"];
var _coreJsData_default = coreJsData;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isMasked.js
var maskSrcKey = function() {
  var uid = /[^.]+$/.exec(_coreJsData_default && _coreJsData_default.keys && _coreJsData_default.keys.IE_PROTO || "");
  return uid ? "Symbol(src)_1." + uid : "";
}();
function isMasked(func) {
  return !!maskSrcKey && maskSrcKey in func;
}
var _isMasked_default = isMasked;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_toSource.js
var funcProto = Function.prototype;
var funcToString = funcProto.toString;
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return func + "";
    } catch (e) {}
  }
  return "";
}
var _toSource_default = toSource;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsNative.js
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
var reIsHostCtor = /^\[object .+?Constructor\]$/;
var funcProto2 = Function.prototype;
var objectProto3 = Object.prototype;
var funcToString2 = funcProto2.toString;
var hasOwnProperty2 = objectProto3.hasOwnProperty;
var reIsNative = RegExp("^" + funcToString2.call(hasOwnProperty2).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$");
function baseIsNative(value) {
  if (!isObject_default(value) || _isMasked_default(value)) {
    return false;
  }
  var pattern = isFunction_default(value) ? reIsNative : reIsHostCtor;
  return pattern.test(_toSource_default(value));
}
var _baseIsNative_default = baseIsNative;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getValue.js
function getValue(object, key) {
  return object == null ? undefined : object[key];
}
var _getValue_default = getValue;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getNative.js
function getNative(object, key) {
  var value = _getValue_default(object, key);
  return _baseIsNative_default(value) ? value : undefined;
}
var _getNative_default = getNative;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_WeakMap.js
var WeakMap2 = _getNative_default(_root_default, "WeakMap");
var _WeakMap_default = WeakMap2;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseCreate.js
var objectCreate = Object.create;
var baseCreate = function() {
  function object() {}
  return function(proto) {
    if (!isObject_default(proto)) {
      return {};
    }
    if (objectCreate) {
      return objectCreate(proto);
    }
    object.prototype = proto;
    var result = new object;
    object.prototype = undefined;
    return result;
  };
}();
var _baseCreate_default = baseCreate;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_apply.js
function apply(func, thisArg, args) {
  switch (args.length) {
    case 0:
      return func.call(thisArg);
    case 1:
      return func.call(thisArg, args[0]);
    case 2:
      return func.call(thisArg, args[0], args[1]);
    case 3:
      return func.call(thisArg, args[0], args[1], args[2]);
  }
  return func.apply(thisArg, args);
}
var _apply_default = apply;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/noop.js
function noop() {}
var noop_default = noop;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_copyArray.js
function copyArray(source, array) {
  var index = -1, length = source.length;
  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}
var _copyArray_default = copyArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_shortOut.js
var HOT_COUNT = 800;
var HOT_SPAN = 16;
var nativeNow = Date.now;
function shortOut(func) {
  var count = 0, lastCalled = 0;
  return function() {
    var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
    lastCalled = stamp;
    if (remaining > 0) {
      if (++count >= HOT_COUNT) {
        return arguments[0];
      }
    } else {
      count = 0;
    }
    return func.apply(undefined, arguments);
  };
}
var _shortOut_default = shortOut;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/constant.js
function constant(value) {
  return function() {
    return value;
  };
}
var constant_default = constant;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_defineProperty.js
var defineProperty = function() {
  try {
    var func = _getNative_default(Object, "defineProperty");
    func({}, "", {});
    return func;
  } catch (e) {}
}();
var _defineProperty_default = defineProperty;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseSetToString.js
var baseSetToString = !_defineProperty_default ? identity_default : function(func, string) {
  return _defineProperty_default(func, "toString", {
    configurable: true,
    enumerable: false,
    value: constant_default(string),
    writable: true
  });
};
var _baseSetToString_default = baseSetToString;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_setToString.js
var setToString = _shortOut_default(_baseSetToString_default);
var _setToString_default = setToString;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayEach.js
function arrayEach(array, iteratee) {
  var index = -1, length = array == null ? 0 : array.length;
  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}
var _arrayEach_default = arrayEach;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseFindIndex.js
function baseFindIndex(array, predicate, fromIndex, fromRight) {
  var length = array.length, index = fromIndex + (fromRight ? 1 : -1);
  while (fromRight ? index-- : ++index < length) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}
var _baseFindIndex_default = baseFindIndex;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsNaN.js
function baseIsNaN(value) {
  return value !== value;
}
var _baseIsNaN_default = baseIsNaN;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_strictIndexOf.js
function strictIndexOf(array, value, fromIndex) {
  var index = fromIndex - 1, length = array.length;
  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}
var _strictIndexOf_default = strictIndexOf;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIndexOf.js
function baseIndexOf(array, value, fromIndex) {
  return value === value ? _strictIndexOf_default(array, value, fromIndex) : _baseFindIndex_default(array, _baseIsNaN_default, fromIndex);
}
var _baseIndexOf_default = baseIndexOf;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayIncludes.js
function arrayIncludes(array, value) {
  var length = array == null ? 0 : array.length;
  return !!length && _baseIndexOf_default(array, value, 0) > -1;
}
var _arrayIncludes_default = arrayIncludes;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isIndex.js
var MAX_SAFE_INTEGER = 9007199254740991;
var reIsUint = /^(?:0|[1-9]\d*)$/;
function isIndex(value, length) {
  var type = typeof value;
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length && (type == "number" || type != "symbol" && reIsUint.test(value)) && (value > -1 && value % 1 == 0 && value < length);
}
var _isIndex_default = isIndex;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseAssignValue.js
function baseAssignValue(object, key, value) {
  if (key == "__proto__" && _defineProperty_default) {
    _defineProperty_default(object, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  } else {
    object[key] = value;
  }
}
var _baseAssignValue_default = baseAssignValue;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/eq.js
function eq(value, other) {
  return value === other || value !== value && other !== other;
}
var eq_default = eq;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_assignValue.js
var objectProto4 = Object.prototype;
var hasOwnProperty3 = objectProto4.hasOwnProperty;
function assignValue(object, key, value) {
  var objValue = object[key];
  if (!(hasOwnProperty3.call(object, key) && eq_default(objValue, value)) || value === undefined && !(key in object)) {
    _baseAssignValue_default(object, key, value);
  }
}
var _assignValue_default = assignValue;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_copyObject.js
function copyObject(source, props, object, customizer) {
  var isNew = !object;
  object || (object = {});
  var index = -1, length = props.length;
  while (++index < length) {
    var key = props[index];
    var newValue = customizer ? customizer(object[key], source[key], key, object, source) : undefined;
    if (newValue === undefined) {
      newValue = source[key];
    }
    if (isNew) {
      _baseAssignValue_default(object, key, newValue);
    } else {
      _assignValue_default(object, key, newValue);
    }
  }
  return object;
}
var _copyObject_default = copyObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_overRest.js
var nativeMax = Math.max;
function overRest(func, start, transform) {
  start = nativeMax(start === undefined ? func.length - 1 : start, 0);
  return function() {
    var args = arguments, index = -1, length = nativeMax(args.length - start, 0), array = Array(length);
    while (++index < length) {
      array[index] = args[start + index];
    }
    index = -1;
    var otherArgs = Array(start + 1);
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = transform(array);
    return _apply_default(func, this, otherArgs);
  };
}
var _overRest_default = overRest;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseRest.js
function baseRest(func, start) {
  return _setToString_default(_overRest_default(func, start, identity_default), func + "");
}
var _baseRest_default = baseRest;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isLength.js
var MAX_SAFE_INTEGER2 = 9007199254740991;
function isLength(value) {
  return typeof value == "number" && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER2;
}
var isLength_default = isLength;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isArrayLike.js
function isArrayLike(value) {
  return value != null && isLength_default(value.length) && !isFunction_default(value);
}
var isArrayLike_default = isArrayLike;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isIterateeCall.js
function isIterateeCall(value, index, object) {
  if (!isObject_default(object)) {
    return false;
  }
  var type = typeof index;
  if (type == "number" ? isArrayLike_default(object) && _isIndex_default(index, object.length) : type == "string" && (index in object)) {
    return eq_default(object[index], value);
  }
  return false;
}
var _isIterateeCall_default = isIterateeCall;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_createAssigner.js
function createAssigner(assigner) {
  return _baseRest_default(function(object, sources) {
    var index = -1, length = sources.length, customizer = length > 1 ? sources[length - 1] : undefined, guard = length > 2 ? sources[2] : undefined;
    customizer = assigner.length > 3 && typeof customizer == "function" ? (length--, customizer) : undefined;
    if (guard && _isIterateeCall_default(sources[0], sources[1], guard)) {
      customizer = length < 3 ? undefined : customizer;
      length = 1;
    }
    object = Object(object);
    while (++index < length) {
      var source = sources[index];
      if (source) {
        assigner(object, source, index, customizer);
      }
    }
    return object;
  });
}
var _createAssigner_default = createAssigner;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isPrototype.js
var objectProto5 = Object.prototype;
function isPrototype(value) {
  var Ctor = value && value.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto5;
  return value === proto;
}
var _isPrototype_default = isPrototype;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseTimes.js
function baseTimes(n, iteratee) {
  var index = -1, result = Array(n);
  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}
var _baseTimes_default = baseTimes;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsArguments.js
var argsTag = "[object Arguments]";
function baseIsArguments(value) {
  return isObjectLike_default(value) && _baseGetTag_default(value) == argsTag;
}
var _baseIsArguments_default = baseIsArguments;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isArguments.js
var objectProto6 = Object.prototype;
var hasOwnProperty4 = objectProto6.hasOwnProperty;
var propertyIsEnumerable = objectProto6.propertyIsEnumerable;
var isArguments = _baseIsArguments_default(function() {
  return arguments;
}()) ? _baseIsArguments_default : function(value) {
  return isObjectLike_default(value) && hasOwnProperty4.call(value, "callee") && !propertyIsEnumerable.call(value, "callee");
};
var isArguments_default = isArguments;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/stubFalse.js
function stubFalse() {
  return false;
}
var stubFalse_default = stubFalse;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isBuffer.js
var freeExports = typeof exports_isBuffer == "object" && exports_isBuffer && !exports_isBuffer.nodeType && exports_isBuffer;
var freeModule = freeExports && typeof module_isBuffer == "object" && module_isBuffer && !module_isBuffer.nodeType && module_isBuffer;
var moduleExports = freeModule && freeModule.exports === freeExports;
var Buffer = moduleExports ? _root_default.Buffer : undefined;
var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;
var isBuffer = nativeIsBuffer || stubFalse_default;
var isBuffer_default = isBuffer;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsTypedArray.js
var argsTag2 = "[object Arguments]";
var arrayTag = "[object Array]";
var boolTag = "[object Boolean]";
var dateTag = "[object Date]";
var errorTag = "[object Error]";
var funcTag2 = "[object Function]";
var mapTag = "[object Map]";
var numberTag = "[object Number]";
var objectTag = "[object Object]";
var regexpTag = "[object RegExp]";
var setTag = "[object Set]";
var stringTag = "[object String]";
var weakMapTag = "[object WeakMap]";
var arrayBufferTag = "[object ArrayBuffer]";
var dataViewTag = "[object DataView]";
var float32Tag = "[object Float32Array]";
var float64Tag = "[object Float64Array]";
var int8Tag = "[object Int8Array]";
var int16Tag = "[object Int16Array]";
var int32Tag = "[object Int32Array]";
var uint8Tag = "[object Uint8Array]";
var uint8ClampedTag = "[object Uint8ClampedArray]";
var uint16Tag = "[object Uint16Array]";
var uint32Tag = "[object Uint32Array]";
var typedArrayTags = {};
typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
typedArrayTags[argsTag2] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag2] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
function baseIsTypedArray(value) {
  return isObjectLike_default(value) && isLength_default(value.length) && !!typedArrayTags[_baseGetTag_default(value)];
}
var _baseIsTypedArray_default = baseIsTypedArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseUnary.js
function baseUnary(func) {
  return function(value) {
    return func(value);
  };
}
var _baseUnary_default = baseUnary;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_nodeUtil.js
var freeExports2 = typeof exports__nodeUtil == "object" && exports__nodeUtil && !exports__nodeUtil.nodeType && exports__nodeUtil;
var freeModule2 = freeExports2 && typeof module__nodeUtil == "object" && module__nodeUtil && !module__nodeUtil.nodeType && module__nodeUtil;
var moduleExports2 = freeModule2 && freeModule2.exports === freeExports2;
var freeProcess = moduleExports2 && _freeGlobal_default.process;
var nodeUtil = function() {
  try {
    var types = freeModule2 && freeModule2.require && freeModule2.require("util").types;
    if (types) {
      return types;
    }
    return freeProcess && freeProcess.binding && freeProcess.binding("util");
  } catch (e) {}
}();
var _nodeUtil_default = nodeUtil;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isTypedArray.js
var nodeIsTypedArray = _nodeUtil_default && _nodeUtil_default.isTypedArray;
var isTypedArray = nodeIsTypedArray ? _baseUnary_default(nodeIsTypedArray) : _baseIsTypedArray_default;
var isTypedArray_default = isTypedArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayLikeKeys.js
var objectProto7 = Object.prototype;
var hasOwnProperty5 = objectProto7.hasOwnProperty;
function arrayLikeKeys(value, inherited) {
  var isArr = isArray_default(value), isArg = !isArr && isArguments_default(value), isBuff = !isArr && !isArg && isBuffer_default(value), isType = !isArr && !isArg && !isBuff && isTypedArray_default(value), skipIndexes = isArr || isArg || isBuff || isType, result = skipIndexes ? _baseTimes_default(value.length, String) : [], length = result.length;
  for (var key in value) {
    if ((inherited || hasOwnProperty5.call(value, key)) && !(skipIndexes && (key == "length" || isBuff && (key == "offset" || key == "parent") || isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || _isIndex_default(key, length)))) {
      result.push(key);
    }
  }
  return result;
}
var _arrayLikeKeys_default = arrayLikeKeys;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_overArg.js
function overArg(func, transform) {
  return function(arg) {
    return func(transform(arg));
  };
}
var _overArg_default = overArg;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_nativeKeys.js
var nativeKeys = _overArg_default(Object.keys, Object);
var _nativeKeys_default = nativeKeys;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseKeys.js
var objectProto8 = Object.prototype;
var hasOwnProperty6 = objectProto8.hasOwnProperty;
function baseKeys(object) {
  if (!_isPrototype_default(object)) {
    return _nativeKeys_default(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty6.call(object, key) && key != "constructor") {
      result.push(key);
    }
  }
  return result;
}
var _baseKeys_default = baseKeys;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/keys.js
function keys(object) {
  return isArrayLike_default(object) ? _arrayLikeKeys_default(object) : _baseKeys_default(object);
}
var keys_default = keys;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_nativeKeysIn.js
function nativeKeysIn(object) {
  var result = [];
  if (object != null) {
    for (var key in Object(object)) {
      result.push(key);
    }
  }
  return result;
}
var _nativeKeysIn_default = nativeKeysIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseKeysIn.js
var objectProto9 = Object.prototype;
var hasOwnProperty7 = objectProto9.hasOwnProperty;
function baseKeysIn(object) {
  if (!isObject_default(object)) {
    return _nativeKeysIn_default(object);
  }
  var isProto = _isPrototype_default(object), result = [];
  for (var key in object) {
    if (!(key == "constructor" && (isProto || !hasOwnProperty7.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}
var _baseKeysIn_default = baseKeysIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/keysIn.js
function keysIn(object) {
  return isArrayLike_default(object) ? _arrayLikeKeys_default(object, true) : _baseKeysIn_default(object);
}
var keysIn_default = keysIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isKey.js
var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
var reIsPlainProp = /^\w*$/;
function isKey(value, object) {
  if (isArray_default(value)) {
    return false;
  }
  var type = typeof value;
  if (type == "number" || type == "symbol" || type == "boolean" || value == null || isSymbol_default(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) || object != null && value in Object(object);
}
var _isKey_default = isKey;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_nativeCreate.js
var nativeCreate = _getNative_default(Object, "create");
var _nativeCreate_default = nativeCreate;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hashClear.js
function hashClear() {
  this.__data__ = _nativeCreate_default ? _nativeCreate_default(null) : {};
  this.size = 0;
}
var _hashClear_default = hashClear;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hashDelete.js
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}
var _hashDelete_default = hashDelete;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hashGet.js
var HASH_UNDEFINED = "__lodash_hash_undefined__";
var objectProto10 = Object.prototype;
var hasOwnProperty8 = objectProto10.hasOwnProperty;
function hashGet(key) {
  var data = this.__data__;
  if (_nativeCreate_default) {
    var result = data[key];
    return result === HASH_UNDEFINED ? undefined : result;
  }
  return hasOwnProperty8.call(data, key) ? data[key] : undefined;
}
var _hashGet_default = hashGet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hashHas.js
var objectProto11 = Object.prototype;
var hasOwnProperty9 = objectProto11.hasOwnProperty;
function hashHas(key) {
  var data = this.__data__;
  return _nativeCreate_default ? data[key] !== undefined : hasOwnProperty9.call(data, key);
}
var _hashHas_default = hashHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hashSet.js
var HASH_UNDEFINED2 = "__lodash_hash_undefined__";
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = _nativeCreate_default && value === undefined ? HASH_UNDEFINED2 : value;
  return this;
}
var _hashSet_default = hashSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Hash.js
function Hash(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
Hash.prototype.clear = _hashClear_default;
Hash.prototype["delete"] = _hashDelete_default;
Hash.prototype.get = _hashGet_default;
Hash.prototype.has = _hashHas_default;
Hash.prototype.set = _hashSet_default;
var _Hash_default = Hash;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_listCacheClear.js
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}
var _listCacheClear_default = listCacheClear;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_assocIndexOf.js
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq_default(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}
var _assocIndexOf_default = assocIndexOf;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_listCacheDelete.js
var arrayProto = Array.prototype;
var splice = arrayProto.splice;
function listCacheDelete(key) {
  var data = this.__data__, index = _assocIndexOf_default(data, key);
  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}
var _listCacheDelete_default = listCacheDelete;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_listCacheGet.js
function listCacheGet(key) {
  var data = this.__data__, index = _assocIndexOf_default(data, key);
  return index < 0 ? undefined : data[index][1];
}
var _listCacheGet_default = listCacheGet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_listCacheHas.js
function listCacheHas(key) {
  return _assocIndexOf_default(this.__data__, key) > -1;
}
var _listCacheHas_default = listCacheHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_listCacheSet.js
function listCacheSet(key, value) {
  var data = this.__data__, index = _assocIndexOf_default(data, key);
  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}
var _listCacheSet_default = listCacheSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_ListCache.js
function ListCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
ListCache.prototype.clear = _listCacheClear_default;
ListCache.prototype["delete"] = _listCacheDelete_default;
ListCache.prototype.get = _listCacheGet_default;
ListCache.prototype.has = _listCacheHas_default;
ListCache.prototype.set = _listCacheSet_default;
var _ListCache_default = ListCache;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Map.js
var Map = _getNative_default(_root_default, "Map");
var _Map_default = Map;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_mapCacheClear.js
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    hash: new _Hash_default,
    map: new (_Map_default || _ListCache_default),
    string: new _Hash_default
  };
}
var _mapCacheClear_default = mapCacheClear;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isKeyable.js
function isKeyable(value) {
  var type = typeof value;
  return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value !== "__proto__" : value === null;
}
var _isKeyable_default = isKeyable;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getMapData.js
function getMapData(map, key) {
  var data = map.__data__;
  return _isKeyable_default(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
}
var _getMapData_default = getMapData;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_mapCacheDelete.js
function mapCacheDelete(key) {
  var result = _getMapData_default(this, key)["delete"](key);
  this.size -= result ? 1 : 0;
  return result;
}
var _mapCacheDelete_default = mapCacheDelete;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_mapCacheGet.js
function mapCacheGet(key) {
  return _getMapData_default(this, key).get(key);
}
var _mapCacheGet_default = mapCacheGet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_mapCacheHas.js
function mapCacheHas(key) {
  return _getMapData_default(this, key).has(key);
}
var _mapCacheHas_default = mapCacheHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_mapCacheSet.js
function mapCacheSet(key, value) {
  var data = _getMapData_default(this, key), size = data.size;
  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}
var _mapCacheSet_default = mapCacheSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_MapCache.js
function MapCache(entries) {
  var index = -1, length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}
MapCache.prototype.clear = _mapCacheClear_default;
MapCache.prototype["delete"] = _mapCacheDelete_default;
MapCache.prototype.get = _mapCacheGet_default;
MapCache.prototype.has = _mapCacheHas_default;
MapCache.prototype.set = _mapCacheSet_default;
var _MapCache_default = MapCache;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/memoize.js
var FUNC_ERROR_TEXT = "Expected a function";
function memoize(func, resolver) {
  if (typeof func != "function" || resolver != null && typeof resolver != "function") {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var memoized = function() {
    var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache = memoized.cache;
    if (cache.has(key)) {
      return cache.get(key);
    }
    var result = func.apply(this, args);
    memoized.cache = cache.set(key, result) || cache;
    return result;
  };
  memoized.cache = new (memoize.Cache || _MapCache_default);
  return memoized;
}
memoize.Cache = _MapCache_default;
var memoize_default = memoize;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_memoizeCapped.js
var MAX_MEMOIZE_SIZE = 500;
function memoizeCapped(func) {
  var result = memoize_default(func, function(key) {
    if (cache.size === MAX_MEMOIZE_SIZE) {
      cache.clear();
    }
    return key;
  });
  var cache = result.cache;
  return result;
}
var _memoizeCapped_default = memoizeCapped;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stringToPath.js
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
var reEscapeChar = /\\(\\)?/g;
var stringToPath = _memoizeCapped_default(function(string) {
  var result = [];
  if (string.charCodeAt(0) === 46) {
    result.push("");
  }
  string.replace(rePropName, function(match, number, quote, subString) {
    result.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
  });
  return result;
});
var _stringToPath_default = stringToPath;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/toString.js
function toString(value) {
  return value == null ? "" : _baseToString_default(value);
}
var toString_default = toString;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_castPath.js
function castPath(value, object) {
  if (isArray_default(value)) {
    return value;
  }
  return _isKey_default(value, object) ? [value] : _stringToPath_default(toString_default(value));
}
var _castPath_default = castPath;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_toKey.js
var INFINITY3 = 1 / 0;
function toKey(value) {
  if (typeof value == "string" || isSymbol_default(value)) {
    return value;
  }
  var result = value + "";
  return result == "0" && 1 / value == -INFINITY3 ? "-0" : result;
}
var _toKey_default = toKey;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseGet.js
function baseGet(object, path) {
  path = _castPath_default(path, object);
  var index = 0, length = path.length;
  while (object != null && index < length) {
    object = object[_toKey_default(path[index++])];
  }
  return index && index == length ? object : undefined;
}
var _baseGet_default = baseGet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/get.js
function get(object, path, defaultValue) {
  var result = object == null ? undefined : _baseGet_default(object, path);
  return result === undefined ? defaultValue : result;
}
var get_default = get;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayPush.js
function arrayPush(array, values) {
  var index = -1, length = values.length, offset = array.length;
  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}
var _arrayPush_default = arrayPush;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isFlattenable.js
var spreadableSymbol = _Symbol_default ? _Symbol_default.isConcatSpreadable : undefined;
function isFlattenable(value) {
  return isArray_default(value) || isArguments_default(value) || !!(spreadableSymbol && value && value[spreadableSymbol]);
}
var _isFlattenable_default = isFlattenable;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseFlatten.js
function baseFlatten(array, depth, predicate, isStrict, result) {
  var index = -1, length = array.length;
  predicate || (predicate = _isFlattenable_default);
  result || (result = []);
  while (++index < length) {
    var value = array[index];
    if (depth > 0 && predicate(value)) {
      if (depth > 1) {
        baseFlatten(value, depth - 1, predicate, isStrict, result);
      } else {
        _arrayPush_default(result, value);
      }
    } else if (!isStrict) {
      result[result.length] = value;
    }
  }
  return result;
}
var _baseFlatten_default = baseFlatten;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/flatten.js
function flatten(array) {
  var length = array == null ? 0 : array.length;
  return length ? _baseFlatten_default(array, 1) : [];
}
var flatten_default = flatten;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_flatRest.js
function flatRest(func) {
  return _setToString_default(_overRest_default(func, undefined, flatten_default), func + "");
}
var _flatRest_default = flatRest;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getPrototype.js
var getPrototype = _overArg_default(Object.getPrototypeOf, Object);
var _getPrototype_default = getPrototype;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isPlainObject.js
var objectTag2 = "[object Object]";
var funcProto3 = Function.prototype;
var objectProto12 = Object.prototype;
var funcToString3 = funcProto3.toString;
var hasOwnProperty10 = objectProto12.hasOwnProperty;
var objectCtorString = funcToString3.call(Object);
function isPlainObject(value) {
  if (!isObjectLike_default(value) || _baseGetTag_default(value) != objectTag2) {
    return false;
  }
  var proto = _getPrototype_default(value);
  if (proto === null) {
    return true;
  }
  var Ctor = hasOwnProperty10.call(proto, "constructor") && proto.constructor;
  return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString3.call(Ctor) == objectCtorString;
}
var isPlainObject_default = isPlainObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hasUnicode.js
var rsAstralRange = "\\ud800-\\udfff";
var rsComboMarksRange = "\\u0300-\\u036f";
var reComboHalfMarksRange = "\\ufe20-\\ufe2f";
var rsComboSymbolsRange = "\\u20d0-\\u20ff";
var rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange;
var rsVarRange = "\\ufe0e\\ufe0f";
var rsZWJ = "\\u200d";
var reHasUnicode = RegExp("[" + rsZWJ + rsAstralRange + rsComboRange + rsVarRange + "]");
function hasUnicode(string) {
  return reHasUnicode.test(string);
}
var _hasUnicode_default = hasUnicode;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayReduce.js
function arrayReduce(array, iteratee, accumulator, initAccum) {
  var index = -1, length = array == null ? 0 : array.length;
  if (initAccum && length) {
    accumulator = array[++index];
  }
  while (++index < length) {
    accumulator = iteratee(accumulator, array[index], index, array);
  }
  return accumulator;
}
var _arrayReduce_default = arrayReduce;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stackClear.js
function stackClear() {
  this.__data__ = new _ListCache_default;
  this.size = 0;
}
var _stackClear_default = stackClear;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stackDelete.js
function stackDelete(key) {
  var data = this.__data__, result = data["delete"](key);
  this.size = data.size;
  return result;
}
var _stackDelete_default = stackDelete;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stackGet.js
function stackGet(key) {
  return this.__data__.get(key);
}
var _stackGet_default = stackGet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stackHas.js
function stackHas(key) {
  return this.__data__.has(key);
}
var _stackHas_default = stackHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stackSet.js
var LARGE_ARRAY_SIZE = 200;
function stackSet(key, value) {
  var data = this.__data__;
  if (data instanceof _ListCache_default) {
    var pairs = data.__data__;
    if (!_Map_default || pairs.length < LARGE_ARRAY_SIZE - 1) {
      pairs.push([key, value]);
      this.size = ++data.size;
      return this;
    }
    data = this.__data__ = new _MapCache_default(pairs);
  }
  data.set(key, value);
  this.size = data.size;
  return this;
}
var _stackSet_default = stackSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Stack.js
function Stack(entries) {
  var data = this.__data__ = new _ListCache_default(entries);
  this.size = data.size;
}
Stack.prototype.clear = _stackClear_default;
Stack.prototype["delete"] = _stackDelete_default;
Stack.prototype.get = _stackGet_default;
Stack.prototype.has = _stackHas_default;
Stack.prototype.set = _stackSet_default;
var _Stack_default = Stack;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseAssign.js
function baseAssign(object, source) {
  return object && _copyObject_default(source, keys_default(source), object);
}
var _baseAssign_default = baseAssign;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseAssignIn.js
function baseAssignIn(object, source) {
  return object && _copyObject_default(source, keysIn_default(source), object);
}
var _baseAssignIn_default = baseAssignIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneBuffer.js
var freeExports3 = typeof exports__cloneBuffer == "object" && exports__cloneBuffer && !exports__cloneBuffer.nodeType && exports__cloneBuffer;
var freeModule3 = freeExports3 && typeof module__cloneBuffer == "object" && module__cloneBuffer && !module__cloneBuffer.nodeType && module__cloneBuffer;
var moduleExports3 = freeModule3 && freeModule3.exports === freeExports3;
var Buffer2 = moduleExports3 ? _root_default.Buffer : undefined;
var allocUnsafe = Buffer2 ? Buffer2.allocUnsafe : undefined;
function cloneBuffer(buffer, isDeep) {
  if (isDeep) {
    return buffer.slice();
  }
  var length = buffer.length, result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
  buffer.copy(result);
  return result;
}
var _cloneBuffer_default = cloneBuffer;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayFilter.js
function arrayFilter(array, predicate) {
  var index = -1, length = array == null ? 0 : array.length, resIndex = 0, result = [];
  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[resIndex++] = value;
    }
  }
  return result;
}
var _arrayFilter_default = arrayFilter;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/stubArray.js
function stubArray() {
  return [];
}
var stubArray_default = stubArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getSymbols.js
var objectProto13 = Object.prototype;
var propertyIsEnumerable2 = objectProto13.propertyIsEnumerable;
var nativeGetSymbols = Object.getOwnPropertySymbols;
var getSymbols = !nativeGetSymbols ? stubArray_default : function(object) {
  if (object == null) {
    return [];
  }
  object = Object(object);
  return _arrayFilter_default(nativeGetSymbols(object), function(symbol) {
    return propertyIsEnumerable2.call(object, symbol);
  });
};
var _getSymbols_default = getSymbols;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_copySymbols.js
function copySymbols(source, object) {
  return _copyObject_default(source, _getSymbols_default(source), object);
}
var _copySymbols_default = copySymbols;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getSymbolsIn.js
var nativeGetSymbols2 = Object.getOwnPropertySymbols;
var getSymbolsIn = !nativeGetSymbols2 ? stubArray_default : function(object) {
  var result = [];
  while (object) {
    _arrayPush_default(result, _getSymbols_default(object));
    object = _getPrototype_default(object);
  }
  return result;
};
var _getSymbolsIn_default = getSymbolsIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_copySymbolsIn.js
function copySymbolsIn(source, object) {
  return _copyObject_default(source, _getSymbolsIn_default(source), object);
}
var _copySymbolsIn_default = copySymbolsIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseGetAllKeys.js
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray_default(object) ? result : _arrayPush_default(result, symbolsFunc(object));
}
var _baseGetAllKeys_default = baseGetAllKeys;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getAllKeys.js
function getAllKeys(object) {
  return _baseGetAllKeys_default(object, keys_default, _getSymbols_default);
}
var _getAllKeys_default = getAllKeys;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getAllKeysIn.js
function getAllKeysIn(object) {
  return _baseGetAllKeys_default(object, keysIn_default, _getSymbolsIn_default);
}
var _getAllKeysIn_default = getAllKeysIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_DataView.js
var DataView = _getNative_default(_root_default, "DataView");
var _DataView_default = DataView;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Promise.js
var Promise2 = _getNative_default(_root_default, "Promise");
var _Promise_default = Promise2;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Set.js
var Set = _getNative_default(_root_default, "Set");
var _Set_default = Set;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getTag.js
var mapTag2 = "[object Map]";
var objectTag3 = "[object Object]";
var promiseTag = "[object Promise]";
var setTag2 = "[object Set]";
var weakMapTag2 = "[object WeakMap]";
var dataViewTag2 = "[object DataView]";
var dataViewCtorString = _toSource_default(_DataView_default);
var mapCtorString = _toSource_default(_Map_default);
var promiseCtorString = _toSource_default(_Promise_default);
var setCtorString = _toSource_default(_Set_default);
var weakMapCtorString = _toSource_default(_WeakMap_default);
var getTag = _baseGetTag_default;
if (_DataView_default && getTag(new _DataView_default(new ArrayBuffer(1))) != dataViewTag2 || _Map_default && getTag(new _Map_default) != mapTag2 || _Promise_default && getTag(_Promise_default.resolve()) != promiseTag || _Set_default && getTag(new _Set_default) != setTag2 || _WeakMap_default && getTag(new _WeakMap_default) != weakMapTag2) {
  getTag = function(value) {
    var result = _baseGetTag_default(value), Ctor = result == objectTag3 ? value.constructor : undefined, ctorString = Ctor ? _toSource_default(Ctor) : "";
    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString:
          return dataViewTag2;
        case mapCtorString:
          return mapTag2;
        case promiseCtorString:
          return promiseTag;
        case setCtorString:
          return setTag2;
        case weakMapCtorString:
          return weakMapTag2;
      }
    }
    return result;
  };
}
var _getTag_default = getTag;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_initCloneArray.js
var objectProto14 = Object.prototype;
var hasOwnProperty11 = objectProto14.hasOwnProperty;
function initCloneArray(array) {
  var length = array.length, result = new array.constructor(length);
  if (length && typeof array[0] == "string" && hasOwnProperty11.call(array, "index")) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}
var _initCloneArray_default = initCloneArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_Uint8Array.js
var Uint8Array = _root_default.Uint8Array;
var _Uint8Array_default = Uint8Array;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneArrayBuffer.js
function cloneArrayBuffer(arrayBuffer) {
  var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
  new _Uint8Array_default(result).set(new _Uint8Array_default(arrayBuffer));
  return result;
}
var _cloneArrayBuffer_default = cloneArrayBuffer;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneDataView.js
function cloneDataView(dataView, isDeep) {
  var buffer = isDeep ? _cloneArrayBuffer_default(dataView.buffer) : dataView.buffer;
  return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
}
var _cloneDataView_default = cloneDataView;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneRegExp.js
var reFlags = /\w*$/;
function cloneRegExp(regexp) {
  var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
  result.lastIndex = regexp.lastIndex;
  return result;
}
var _cloneRegExp_default = cloneRegExp;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneSymbol.js
var symbolProto2 = _Symbol_default ? _Symbol_default.prototype : undefined;
var symbolValueOf = symbolProto2 ? symbolProto2.valueOf : undefined;
function cloneSymbol(symbol) {
  return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
}
var _cloneSymbol_default = cloneSymbol;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cloneTypedArray.js
function cloneTypedArray(typedArray, isDeep) {
  var buffer = isDeep ? _cloneArrayBuffer_default(typedArray.buffer) : typedArray.buffer;
  return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
}
var _cloneTypedArray_default = cloneTypedArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_initCloneByTag.js
var boolTag2 = "[object Boolean]";
var dateTag2 = "[object Date]";
var mapTag3 = "[object Map]";
var numberTag2 = "[object Number]";
var regexpTag2 = "[object RegExp]";
var setTag3 = "[object Set]";
var stringTag2 = "[object String]";
var symbolTag2 = "[object Symbol]";
var arrayBufferTag2 = "[object ArrayBuffer]";
var dataViewTag3 = "[object DataView]";
var float32Tag2 = "[object Float32Array]";
var float64Tag2 = "[object Float64Array]";
var int8Tag2 = "[object Int8Array]";
var int16Tag2 = "[object Int16Array]";
var int32Tag2 = "[object Int32Array]";
var uint8Tag2 = "[object Uint8Array]";
var uint8ClampedTag2 = "[object Uint8ClampedArray]";
var uint16Tag2 = "[object Uint16Array]";
var uint32Tag2 = "[object Uint32Array]";
function initCloneByTag(object, tag, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag2:
      return _cloneArrayBuffer_default(object);
    case boolTag2:
    case dateTag2:
      return new Ctor(+object);
    case dataViewTag3:
      return _cloneDataView_default(object, isDeep);
    case float32Tag2:
    case float64Tag2:
    case int8Tag2:
    case int16Tag2:
    case int32Tag2:
    case uint8Tag2:
    case uint8ClampedTag2:
    case uint16Tag2:
    case uint32Tag2:
      return _cloneTypedArray_default(object, isDeep);
    case mapTag3:
      return new Ctor;
    case numberTag2:
    case stringTag2:
      return new Ctor(object);
    case regexpTag2:
      return _cloneRegExp_default(object);
    case setTag3:
      return new Ctor;
    case symbolTag2:
      return _cloneSymbol_default(object);
  }
}
var _initCloneByTag_default = initCloneByTag;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_initCloneObject.js
function initCloneObject(object) {
  return typeof object.constructor == "function" && !_isPrototype_default(object) ? _baseCreate_default(_getPrototype_default(object)) : {};
}
var _initCloneObject_default = initCloneObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsMap.js
var mapTag4 = "[object Map]";
function baseIsMap(value) {
  return isObjectLike_default(value) && _getTag_default(value) == mapTag4;
}
var _baseIsMap_default = baseIsMap;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isMap.js
var nodeIsMap = _nodeUtil_default && _nodeUtil_default.isMap;
var isMap = nodeIsMap ? _baseUnary_default(nodeIsMap) : _baseIsMap_default;
var isMap_default = isMap;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsSet.js
var setTag4 = "[object Set]";
function baseIsSet(value) {
  return isObjectLike_default(value) && _getTag_default(value) == setTag4;
}
var _baseIsSet_default = baseIsSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isSet.js
var nodeIsSet = _nodeUtil_default && _nodeUtil_default.isSet;
var isSet = nodeIsSet ? _baseUnary_default(nodeIsSet) : _baseIsSet_default;
var isSet_default = isSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseClone.js
var CLONE_DEEP_FLAG = 1;
var CLONE_FLAT_FLAG = 2;
var CLONE_SYMBOLS_FLAG = 4;
var argsTag3 = "[object Arguments]";
var arrayTag2 = "[object Array]";
var boolTag3 = "[object Boolean]";
var dateTag3 = "[object Date]";
var errorTag2 = "[object Error]";
var funcTag3 = "[object Function]";
var genTag2 = "[object GeneratorFunction]";
var mapTag5 = "[object Map]";
var numberTag3 = "[object Number]";
var objectTag4 = "[object Object]";
var regexpTag3 = "[object RegExp]";
var setTag5 = "[object Set]";
var stringTag3 = "[object String]";
var symbolTag3 = "[object Symbol]";
var weakMapTag3 = "[object WeakMap]";
var arrayBufferTag3 = "[object ArrayBuffer]";
var dataViewTag4 = "[object DataView]";
var float32Tag3 = "[object Float32Array]";
var float64Tag3 = "[object Float64Array]";
var int8Tag3 = "[object Int8Array]";
var int16Tag3 = "[object Int16Array]";
var int32Tag3 = "[object Int32Array]";
var uint8Tag3 = "[object Uint8Array]";
var uint8ClampedTag3 = "[object Uint8ClampedArray]";
var uint16Tag3 = "[object Uint16Array]";
var uint32Tag3 = "[object Uint32Array]";
var cloneableTags = {};
cloneableTags[argsTag3] = cloneableTags[arrayTag2] = cloneableTags[arrayBufferTag3] = cloneableTags[dataViewTag4] = cloneableTags[boolTag3] = cloneableTags[dateTag3] = cloneableTags[float32Tag3] = cloneableTags[float64Tag3] = cloneableTags[int8Tag3] = cloneableTags[int16Tag3] = cloneableTags[int32Tag3] = cloneableTags[mapTag5] = cloneableTags[numberTag3] = cloneableTags[objectTag4] = cloneableTags[regexpTag3] = cloneableTags[setTag5] = cloneableTags[stringTag3] = cloneableTags[symbolTag3] = cloneableTags[uint8Tag3] = cloneableTags[uint8ClampedTag3] = cloneableTags[uint16Tag3] = cloneableTags[uint32Tag3] = true;
cloneableTags[errorTag2] = cloneableTags[funcTag3] = cloneableTags[weakMapTag3] = false;
function baseClone(value, bitmask, customizer, key, object, stack) {
  var result, isDeep = bitmask & CLONE_DEEP_FLAG, isFlat = bitmask & CLONE_FLAT_FLAG, isFull = bitmask & CLONE_SYMBOLS_FLAG;
  if (customizer) {
    result = object ? customizer(value, key, object, stack) : customizer(value);
  }
  if (result !== undefined) {
    return result;
  }
  if (!isObject_default(value)) {
    return value;
  }
  var isArr = isArray_default(value);
  if (isArr) {
    result = _initCloneArray_default(value);
    if (!isDeep) {
      return _copyArray_default(value, result);
    }
  } else {
    var tag = _getTag_default(value), isFunc = tag == funcTag3 || tag == genTag2;
    if (isBuffer_default(value)) {
      return _cloneBuffer_default(value, isDeep);
    }
    if (tag == objectTag4 || tag == argsTag3 || isFunc && !object) {
      result = isFlat || isFunc ? {} : _initCloneObject_default(value);
      if (!isDeep) {
        return isFlat ? _copySymbolsIn_default(value, _baseAssignIn_default(result, value)) : _copySymbols_default(value, _baseAssign_default(result, value));
      }
    } else {
      if (!cloneableTags[tag]) {
        return object ? value : {};
      }
      result = _initCloneByTag_default(value, tag, isDeep);
    }
  }
  stack || (stack = new _Stack_default);
  var stacked = stack.get(value);
  if (stacked) {
    return stacked;
  }
  stack.set(value, result);
  if (isSet_default(value)) {
    value.forEach(function(subValue) {
      result.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
    });
  } else if (isMap_default(value)) {
    value.forEach(function(subValue, key) {
      result.set(key, baseClone(subValue, bitmask, customizer, key, value, stack));
    });
  }
  var keysFunc = isFull ? isFlat ? _getAllKeysIn_default : _getAllKeys_default : isFlat ? keysIn_default : keys_default;
  var props = isArr ? undefined : keysFunc(value);
  _arrayEach_default(props || value, function(subValue, key) {
    if (props) {
      key = subValue;
      subValue = value[key];
    }
    _assignValue_default(result, key, baseClone(subValue, bitmask, customizer, key, value, stack));
  });
  return result;
}
var _baseClone_default = baseClone;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/cloneDeep.js
var CLONE_DEEP_FLAG2 = 1;
var CLONE_SYMBOLS_FLAG2 = 4;
function cloneDeep(value) {
  return _baseClone_default(value, CLONE_DEEP_FLAG2 | CLONE_SYMBOLS_FLAG2);
}
var cloneDeep_default = cloneDeep;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_setCacheAdd.js
var HASH_UNDEFINED3 = "__lodash_hash_undefined__";
function setCacheAdd(value) {
  this.__data__.set(value, HASH_UNDEFINED3);
  return this;
}
var _setCacheAdd_default = setCacheAdd;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_setCacheHas.js
function setCacheHas(value) {
  return this.__data__.has(value);
}
var _setCacheHas_default = setCacheHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_SetCache.js
function SetCache(values) {
  var index = -1, length = values == null ? 0 : values.length;
  this.__data__ = new _MapCache_default;
  while (++index < length) {
    this.add(values[index]);
  }
}
SetCache.prototype.add = SetCache.prototype.push = _setCacheAdd_default;
SetCache.prototype.has = _setCacheHas_default;
var _SetCache_default = SetCache;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arraySome.js
function arraySome(array, predicate) {
  var index = -1, length = array == null ? 0 : array.length;
  while (++index < length) {
    if (predicate(array[index], index, array)) {
      return true;
    }
  }
  return false;
}
var _arraySome_default = arraySome;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_cacheHas.js
function cacheHas(cache, key) {
  return cache.has(key);
}
var _cacheHas_default = cacheHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_equalArrays.js
var COMPARE_PARTIAL_FLAG = 1;
var COMPARE_UNORDERED_FLAG = 2;
function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
  if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
    return false;
  }
  var arrStacked = stack.get(array);
  var othStacked = stack.get(other);
  if (arrStacked && othStacked) {
    return arrStacked == other && othStacked == array;
  }
  var index = -1, result = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new _SetCache_default : undefined;
  stack.set(array, other);
  stack.set(other, array);
  while (++index < arrLength) {
    var arrValue = array[index], othValue = other[index];
    if (customizer) {
      var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
    }
    if (compared !== undefined) {
      if (compared) {
        continue;
      }
      result = false;
      break;
    }
    if (seen) {
      if (!_arraySome_default(other, function(othValue, othIndex) {
        if (!_cacheHas_default(seen, othIndex) && (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
          return seen.push(othIndex);
        }
      })) {
        result = false;
        break;
      }
    } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
      result = false;
      break;
    }
  }
  stack["delete"](array);
  stack["delete"](other);
  return result;
}
var _equalArrays_default = equalArrays;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_mapToArray.js
function mapToArray(map) {
  var index = -1, result = Array(map.size);
  map.forEach(function(value, key) {
    result[++index] = [key, value];
  });
  return result;
}
var _mapToArray_default = mapToArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_setToArray.js
function setToArray(set) {
  var index = -1, result = Array(set.size);
  set.forEach(function(value) {
    result[++index] = value;
  });
  return result;
}
var _setToArray_default = setToArray;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_equalByTag.js
var COMPARE_PARTIAL_FLAG2 = 1;
var COMPARE_UNORDERED_FLAG2 = 2;
var boolTag4 = "[object Boolean]";
var dateTag4 = "[object Date]";
var errorTag3 = "[object Error]";
var mapTag6 = "[object Map]";
var numberTag4 = "[object Number]";
var regexpTag4 = "[object RegExp]";
var setTag6 = "[object Set]";
var stringTag4 = "[object String]";
var symbolTag4 = "[object Symbol]";
var arrayBufferTag4 = "[object ArrayBuffer]";
var dataViewTag5 = "[object DataView]";
var symbolProto3 = _Symbol_default ? _Symbol_default.prototype : undefined;
var symbolValueOf2 = symbolProto3 ? symbolProto3.valueOf : undefined;
function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
  switch (tag) {
    case dataViewTag5:
      if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
        return false;
      }
      object = object.buffer;
      other = other.buffer;
    case arrayBufferTag4:
      if (object.byteLength != other.byteLength || !equalFunc(new _Uint8Array_default(object), new _Uint8Array_default(other))) {
        return false;
      }
      return true;
    case boolTag4:
    case dateTag4:
    case numberTag4:
      return eq_default(+object, +other);
    case errorTag3:
      return object.name == other.name && object.message == other.message;
    case regexpTag4:
    case stringTag4:
      return object == other + "";
    case mapTag6:
      var convert = _mapToArray_default;
    case setTag6:
      var isPartial = bitmask & COMPARE_PARTIAL_FLAG2;
      convert || (convert = _setToArray_default);
      if (object.size != other.size && !isPartial) {
        return false;
      }
      var stacked = stack.get(object);
      if (stacked) {
        return stacked == other;
      }
      bitmask |= COMPARE_UNORDERED_FLAG2;
      stack.set(object, other);
      var result = _equalArrays_default(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
      stack["delete"](object);
      return result;
    case symbolTag4:
      if (symbolValueOf2) {
        return symbolValueOf2.call(object) == symbolValueOf2.call(other);
      }
  }
  return false;
}
var _equalByTag_default = equalByTag;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_equalObjects.js
var COMPARE_PARTIAL_FLAG3 = 1;
var objectProto15 = Object.prototype;
var hasOwnProperty12 = objectProto15.hasOwnProperty;
function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
  var isPartial = bitmask & COMPARE_PARTIAL_FLAG3, objProps = _getAllKeys_default(object), objLength = objProps.length, othProps = _getAllKeys_default(other), othLength = othProps.length;
  if (objLength != othLength && !isPartial) {
    return false;
  }
  var index = objLength;
  while (index--) {
    var key = objProps[index];
    if (!(isPartial ? key in other : hasOwnProperty12.call(other, key))) {
      return false;
    }
  }
  var objStacked = stack.get(object);
  var othStacked = stack.get(other);
  if (objStacked && othStacked) {
    return objStacked == other && othStacked == object;
  }
  var result = true;
  stack.set(object, other);
  stack.set(other, object);
  var skipCtor = isPartial;
  while (++index < objLength) {
    key = objProps[index];
    var objValue = object[key], othValue = other[key];
    if (customizer) {
      var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
    }
    if (!(compared === undefined ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
      result = false;
      break;
    }
    skipCtor || (skipCtor = key == "constructor");
  }
  if (result && !skipCtor) {
    var objCtor = object.constructor, othCtor = other.constructor;
    if (objCtor != othCtor && (("constructor" in object) && ("constructor" in other)) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
      result = false;
    }
  }
  stack["delete"](object);
  stack["delete"](other);
  return result;
}
var _equalObjects_default = equalObjects;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsEqualDeep.js
var COMPARE_PARTIAL_FLAG4 = 1;
var argsTag4 = "[object Arguments]";
var arrayTag3 = "[object Array]";
var objectTag5 = "[object Object]";
var objectProto16 = Object.prototype;
var hasOwnProperty13 = objectProto16.hasOwnProperty;
function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
  var objIsArr = isArray_default(object), othIsArr = isArray_default(other), objTag = objIsArr ? arrayTag3 : _getTag_default(object), othTag = othIsArr ? arrayTag3 : _getTag_default(other);
  objTag = objTag == argsTag4 ? objectTag5 : objTag;
  othTag = othTag == argsTag4 ? objectTag5 : othTag;
  var objIsObj = objTag == objectTag5, othIsObj = othTag == objectTag5, isSameTag = objTag == othTag;
  if (isSameTag && isBuffer_default(object)) {
    if (!isBuffer_default(other)) {
      return false;
    }
    objIsArr = true;
    objIsObj = false;
  }
  if (isSameTag && !objIsObj) {
    stack || (stack = new _Stack_default);
    return objIsArr || isTypedArray_default(object) ? _equalArrays_default(object, other, bitmask, customizer, equalFunc, stack) : _equalByTag_default(object, other, objTag, bitmask, customizer, equalFunc, stack);
  }
  if (!(bitmask & COMPARE_PARTIAL_FLAG4)) {
    var objIsWrapped = objIsObj && hasOwnProperty13.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty13.call(other, "__wrapped__");
    if (objIsWrapped || othIsWrapped) {
      var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
      stack || (stack = new _Stack_default);
      return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
    }
  }
  if (!isSameTag) {
    return false;
  }
  stack || (stack = new _Stack_default);
  return _equalObjects_default(object, other, bitmask, customizer, equalFunc, stack);
}
var _baseIsEqualDeep_default = baseIsEqualDeep;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsEqual.js
function baseIsEqual(value, other, bitmask, customizer, stack) {
  if (value === other) {
    return true;
  }
  if (value == null || other == null || !isObjectLike_default(value) && !isObjectLike_default(other)) {
    return value !== value && other !== other;
  }
  return _baseIsEqualDeep_default(value, other, bitmask, customizer, baseIsEqual, stack);
}
var _baseIsEqual_default = baseIsEqual;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIsMatch.js
var COMPARE_PARTIAL_FLAG5 = 1;
var COMPARE_UNORDERED_FLAG3 = 2;
function baseIsMatch(object, source, matchData, customizer) {
  var index = matchData.length, length = index, noCustomizer = !customizer;
  if (object == null) {
    return !length;
  }
  object = Object(object);
  while (index--) {
    var data = matchData[index];
    if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
      return false;
    }
  }
  while (++index < length) {
    data = matchData[index];
    var key = data[0], objValue = object[key], srcValue = data[1];
    if (noCustomizer && data[2]) {
      if (objValue === undefined && !(key in object)) {
        return false;
      }
    } else {
      var stack = new _Stack_default;
      if (customizer) {
        var result = customizer(objValue, srcValue, key, object, source, stack);
      }
      if (!(result === undefined ? _baseIsEqual_default(srcValue, objValue, COMPARE_PARTIAL_FLAG5 | COMPARE_UNORDERED_FLAG3, customizer, stack) : result)) {
        return false;
      }
    }
  }
  return true;
}
var _baseIsMatch_default = baseIsMatch;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_isStrictComparable.js
function isStrictComparable(value) {
  return value === value && !isObject_default(value);
}
var _isStrictComparable_default = isStrictComparable;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_getMatchData.js
function getMatchData(object) {
  var result = keys_default(object), length = result.length;
  while (length--) {
    var key = result[length], value = object[key];
    result[length] = [key, value, _isStrictComparable_default(value)];
  }
  return result;
}
var _getMatchData_default = getMatchData;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_matchesStrictComparable.js
function matchesStrictComparable(key, srcValue) {
  return function(object) {
    if (object == null) {
      return false;
    }
    return object[key] === srcValue && (srcValue !== undefined || (key in Object(object)));
  };
}
var _matchesStrictComparable_default = matchesStrictComparable;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseMatches.js
function baseMatches(source) {
  var matchData = _getMatchData_default(source);
  if (matchData.length == 1 && matchData[0][2]) {
    return _matchesStrictComparable_default(matchData[0][0], matchData[0][1]);
  }
  return function(object) {
    return object === source || _baseIsMatch_default(object, source, matchData);
  };
}
var _baseMatches_default = baseMatches;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseHasIn.js
function baseHasIn(object, key) {
  return object != null && key in Object(object);
}
var _baseHasIn_default = baseHasIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_hasPath.js
function hasPath(object, path, hasFunc) {
  path = _castPath_default(path, object);
  var index = -1, length = path.length, result = false;
  while (++index < length) {
    var key = _toKey_default(path[index]);
    if (!(result = object != null && hasFunc(object, key))) {
      break;
    }
    object = object[key];
  }
  if (result || ++index != length) {
    return result;
  }
  length = object == null ? 0 : object.length;
  return !!length && isLength_default(length) && _isIndex_default(key, length) && (isArray_default(object) || isArguments_default(object));
}
var _hasPath_default = hasPath;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/hasIn.js
function hasIn(object, path) {
  return object != null && _hasPath_default(object, path, _baseHasIn_default);
}
var hasIn_default = hasIn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseMatchesProperty.js
var COMPARE_PARTIAL_FLAG6 = 1;
var COMPARE_UNORDERED_FLAG4 = 2;
function baseMatchesProperty(path, srcValue) {
  if (_isKey_default(path) && _isStrictComparable_default(srcValue)) {
    return _matchesStrictComparable_default(_toKey_default(path), srcValue);
  }
  return function(object) {
    var objValue = get_default(object, path);
    return objValue === undefined && objValue === srcValue ? hasIn_default(object, path) : _baseIsEqual_default(srcValue, objValue, COMPARE_PARTIAL_FLAG6 | COMPARE_UNORDERED_FLAG4);
  };
}
var _baseMatchesProperty_default = baseMatchesProperty;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseProperty.js
function baseProperty(key) {
  return function(object) {
    return object == null ? undefined : object[key];
  };
}
var _baseProperty_default = baseProperty;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_basePropertyDeep.js
function basePropertyDeep(path) {
  return function(object) {
    return _baseGet_default(object, path);
  };
}
var _basePropertyDeep_default = basePropertyDeep;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/property.js
function property(path) {
  return _isKey_default(path) ? _baseProperty_default(_toKey_default(path)) : _basePropertyDeep_default(path);
}
var property_default = property;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseIteratee.js
function baseIteratee(value) {
  if (typeof value == "function") {
    return value;
  }
  if (value == null) {
    return identity_default;
  }
  if (typeof value == "object") {
    return isArray_default(value) ? _baseMatchesProperty_default(value[0], value[1]) : _baseMatches_default(value);
  }
  return property_default(value);
}
var _baseIteratee_default = baseIteratee;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_createBaseFor.js
function createBaseFor(fromRight) {
  return function(object, iteratee, keysFunc) {
    var index = -1, iterable = Object(object), props = keysFunc(object), length = props.length;
    while (length--) {
      var key = props[fromRight ? length : ++index];
      if (iteratee(iterable[key], key, iterable) === false) {
        break;
      }
    }
    return object;
  };
}
var _createBaseFor_default = createBaseFor;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseFor.js
var baseFor = _createBaseFor_default();
var _baseFor_default = baseFor;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseForOwn.js
function baseForOwn(object, iteratee) {
  return object && _baseFor_default(object, iteratee, keys_default);
}
var _baseForOwn_default = baseForOwn;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_createBaseEach.js
function createBaseEach(eachFunc, fromRight) {
  return function(collection, iteratee) {
    if (collection == null) {
      return collection;
    }
    if (!isArrayLike_default(collection)) {
      return eachFunc(collection, iteratee);
    }
    var length = collection.length, index = fromRight ? length : -1, iterable = Object(collection);
    while (fromRight ? index-- : ++index < length) {
      if (iteratee(iterable[index], index, iterable) === false) {
        break;
      }
    }
    return collection;
  };
}
var _createBaseEach_default = createBaseEach;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseEach.js
var baseEach = _createBaseEach_default(_baseForOwn_default);
var _baseEach_default = baseEach;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/now.js
var now = function() {
  return _root_default.Date.now();
};
var now_default = now;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/defaults.js
var objectProto17 = Object.prototype;
var hasOwnProperty14 = objectProto17.hasOwnProperty;
var defaults = _baseRest_default(function(object, sources) {
  object = Object(object);
  var index = -1;
  var length = sources.length;
  var guard = length > 2 ? sources[2] : undefined;
  if (guard && _isIterateeCall_default(sources[0], sources[1], guard)) {
    length = 1;
  }
  while (++index < length) {
    var source = sources[index];
    var props = keysIn_default(source);
    var propsIndex = -1;
    var propsLength = props.length;
    while (++propsIndex < propsLength) {
      var key = props[propsIndex];
      var value = object[key];
      if (value === undefined || eq_default(value, objectProto17[key]) && !hasOwnProperty14.call(object, key)) {
        object[key] = source[key];
      }
    }
  }
  return object;
});
var defaults_default = defaults;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_assignMergeValue.js
function assignMergeValue(object, key, value) {
  if (value !== undefined && !eq_default(object[key], value) || value === undefined && !(key in object)) {
    _baseAssignValue_default(object, key, value);
  }
}
var _assignMergeValue_default = assignMergeValue;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isArrayLikeObject.js
function isArrayLikeObject(value) {
  return isObjectLike_default(value) && isArrayLike_default(value);
}
var isArrayLikeObject_default = isArrayLikeObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_safeGet.js
function safeGet(object, key) {
  if (key === "constructor" && typeof object[key] === "function") {
    return;
  }
  if (key == "__proto__") {
    return;
  }
  return object[key];
}
var _safeGet_default = safeGet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/toPlainObject.js
function toPlainObject(value) {
  return _copyObject_default(value, keysIn_default(value));
}
var toPlainObject_default = toPlainObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseMergeDeep.js
function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
  var objValue = _safeGet_default(object, key), srcValue = _safeGet_default(source, key), stacked = stack.get(srcValue);
  if (stacked) {
    _assignMergeValue_default(object, key, stacked);
    return;
  }
  var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : undefined;
  var isCommon = newValue === undefined;
  if (isCommon) {
    var isArr = isArray_default(srcValue), isBuff = !isArr && isBuffer_default(srcValue), isTyped = !isArr && !isBuff && isTypedArray_default(srcValue);
    newValue = srcValue;
    if (isArr || isBuff || isTyped) {
      if (isArray_default(objValue)) {
        newValue = objValue;
      } else if (isArrayLikeObject_default(objValue)) {
        newValue = _copyArray_default(objValue);
      } else if (isBuff) {
        isCommon = false;
        newValue = _cloneBuffer_default(srcValue, true);
      } else if (isTyped) {
        isCommon = false;
        newValue = _cloneTypedArray_default(srcValue, true);
      } else {
        newValue = [];
      }
    } else if (isPlainObject_default(srcValue) || isArguments_default(srcValue)) {
      newValue = objValue;
      if (isArguments_default(objValue)) {
        newValue = toPlainObject_default(objValue);
      } else if (!isObject_default(objValue) || isFunction_default(objValue)) {
        newValue = _initCloneObject_default(srcValue);
      }
    } else {
      isCommon = false;
    }
  }
  if (isCommon) {
    stack.set(srcValue, newValue);
    mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
    stack["delete"](srcValue);
  }
  _assignMergeValue_default(object, key, newValue);
}
var _baseMergeDeep_default = baseMergeDeep;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseMerge.js
function baseMerge(object, source, srcIndex, customizer, stack) {
  if (object === source) {
    return;
  }
  _baseFor_default(source, function(srcValue, key) {
    stack || (stack = new _Stack_default);
    if (isObject_default(srcValue)) {
      _baseMergeDeep_default(object, source, key, srcIndex, baseMerge, customizer, stack);
    } else {
      var newValue = customizer ? customizer(_safeGet_default(object, key), srcValue, key + "", object, source, stack) : undefined;
      if (newValue === undefined) {
        newValue = srcValue;
      }
      _assignMergeValue_default(object, key, newValue);
    }
  }, keysIn_default);
}
var _baseMerge_default = baseMerge;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_arrayIncludesWith.js
function arrayIncludesWith(array, value, comparator) {
  var index = -1, length = array == null ? 0 : array.length;
  while (++index < length) {
    if (comparator(value, array[index])) {
      return true;
    }
  }
  return false;
}
var _arrayIncludesWith_default = arrayIncludesWith;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/last.js
function last(array) {
  var length = array == null ? 0 : array.length;
  return length ? array[length - 1] : undefined;
}
var last_default = last;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_castFunction.js
function castFunction(value) {
  return typeof value == "function" ? value : identity_default;
}
var _castFunction_default = castFunction;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/forEach.js
function forEach(collection, iteratee) {
  var func = isArray_default(collection) ? _arrayEach_default : _baseEach_default;
  return func(collection, _castFunction_default(iteratee));
}
var forEach_default = forEach;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseFilter.js
function baseFilter(collection, predicate) {
  var result = [];
  _baseEach_default(collection, function(value, index, collection) {
    if (predicate(value, index, collection)) {
      result.push(value);
    }
  });
  return result;
}
var _baseFilter_default = baseFilter;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/filter.js
function filter(collection, predicate) {
  var func = isArray_default(collection) ? _arrayFilter_default : _baseFilter_default;
  return func(collection, _baseIteratee_default(predicate, 3));
}
var filter_default = filter;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_createFind.js
function createFind(findIndexFunc) {
  return function(collection, predicate, fromIndex) {
    var iterable = Object(collection);
    if (!isArrayLike_default(collection)) {
      var iteratee = _baseIteratee_default(predicate, 3);
      collection = keys_default(collection);
      predicate = function(key) {
        return iteratee(iterable[key], key, iterable);
      };
    }
    var index = findIndexFunc(collection, predicate, fromIndex);
    return index > -1 ? iterable[iteratee ? collection[index] : index] : undefined;
  };
}
var _createFind_default = createFind;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/findIndex.js
var nativeMax2 = Math.max;
function findIndex(array, predicate, fromIndex) {
  var length = array == null ? 0 : array.length;
  if (!length) {
    return -1;
  }
  var index = fromIndex == null ? 0 : toInteger_default(fromIndex);
  if (index < 0) {
    index = nativeMax2(length + index, 0);
  }
  return _baseFindIndex_default(array, _baseIteratee_default(predicate, 3), index);
}
var findIndex_default = findIndex;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/find.js
var find = _createFind_default(findIndex_default);
var find_default = find;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseMap.js
function baseMap(collection, iteratee) {
  var index = -1, result = isArrayLike_default(collection) ? Array(collection.length) : [];
  _baseEach_default(collection, function(value, key, collection) {
    result[++index] = iteratee(value, key, collection);
  });
  return result;
}
var _baseMap_default = baseMap;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/map.js
function map(collection, iteratee) {
  var func = isArray_default(collection) ? _arrayMap_default : _baseMap_default;
  return func(collection, _baseIteratee_default(iteratee, 3));
}
var map_default = map;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/forIn.js
function forIn(object, iteratee) {
  return object == null ? object : _baseFor_default(object, _castFunction_default(iteratee), keysIn_default);
}
var forIn_default = forIn;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/forOwn.js
function forOwn(object, iteratee) {
  return object && _baseForOwn_default(object, _castFunction_default(iteratee));
}
var forOwn_default = forOwn;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseGt.js
function baseGt(value, other) {
  return value > other;
}
var _baseGt_default = baseGt;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseHas.js
var objectProto18 = Object.prototype;
var hasOwnProperty15 = objectProto18.hasOwnProperty;
function baseHas(object, key) {
  return object != null && hasOwnProperty15.call(object, key);
}
var _baseHas_default = baseHas;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/has.js
function has(object, path) {
  return object != null && _hasPath_default(object, path, _baseHas_default);
}
var has_default = has;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isString.js
var stringTag5 = "[object String]";
function isString(value) {
  return typeof value == "string" || !isArray_default(value) && isObjectLike_default(value) && _baseGetTag_default(value) == stringTag5;
}
var isString_default = isString;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseValues.js
function baseValues(object, props) {
  return _arrayMap_default(props, function(key) {
    return object[key];
  });
}
var _baseValues_default = baseValues;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/values.js
function values(object) {
  return object == null ? [] : _baseValues_default(object, keys_default(object));
}
var values_default = values;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isEmpty.js
var mapTag7 = "[object Map]";
var setTag7 = "[object Set]";
var objectProto19 = Object.prototype;
var hasOwnProperty16 = objectProto19.hasOwnProperty;
function isEmpty(value) {
  if (value == null) {
    return true;
  }
  if (isArrayLike_default(value) && (isArray_default(value) || typeof value == "string" || typeof value.splice == "function" || isBuffer_default(value) || isTypedArray_default(value) || isArguments_default(value))) {
    return !value.length;
  }
  var tag = _getTag_default(value);
  if (tag == mapTag7 || tag == setTag7) {
    return !value.size;
  }
  if (_isPrototype_default(value)) {
    return !_baseKeys_default(value).length;
  }
  for (var key in value) {
    if (hasOwnProperty16.call(value, key)) {
      return false;
    }
  }
  return true;
}
var isEmpty_default = isEmpty;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/isUndefined.js
function isUndefined(value) {
  return value === undefined;
}
var isUndefined_default = isUndefined;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseLt.js
function baseLt(value, other) {
  return value < other;
}
var _baseLt_default = baseLt;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/mapValues.js
function mapValues(object, iteratee) {
  var result = {};
  iteratee = _baseIteratee_default(iteratee, 3);
  _baseForOwn_default(object, function(value, key, object) {
    _baseAssignValue_default(result, key, iteratee(value, key, object));
  });
  return result;
}
var mapValues_default = mapValues;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseExtremum.js
function baseExtremum(array, iteratee, comparator) {
  var index = -1, length = array.length;
  while (++index < length) {
    var value = array[index], current = iteratee(value);
    if (current != null && (computed === undefined ? current === current && !isSymbol_default(current) : comparator(current, computed))) {
      var computed = current, result = value;
    }
  }
  return result;
}
var _baseExtremum_default = baseExtremum;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/max.js
function max(array) {
  return array && array.length ? _baseExtremum_default(array, identity_default, _baseGt_default) : undefined;
}
var max_default = max;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/merge.js
var merge = _createAssigner_default(function(object, source, srcIndex) {
  _baseMerge_default(object, source, srcIndex);
});
var merge_default = merge;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/min.js
function min(array) {
  return array && array.length ? _baseExtremum_default(array, identity_default, _baseLt_default) : undefined;
}
var min_default = min;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/minBy.js
function minBy(array, iteratee) {
  return array && array.length ? _baseExtremum_default(array, _baseIteratee_default(iteratee, 2), _baseLt_default) : undefined;
}
var minBy_default = minBy;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseSet.js
function baseSet(object, path, value, customizer) {
  if (!isObject_default(object)) {
    return object;
  }
  path = _castPath_default(path, object);
  var index = -1, length = path.length, lastIndex = length - 1, nested = object;
  while (nested != null && ++index < length) {
    var key = _toKey_default(path[index]), newValue = value;
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return object;
    }
    if (index != lastIndex) {
      var objValue = nested[key];
      newValue = customizer ? customizer(objValue, key, nested) : undefined;
      if (newValue === undefined) {
        newValue = isObject_default(objValue) ? objValue : _isIndex_default(path[index + 1]) ? [] : {};
      }
    }
    _assignValue_default(nested, key, newValue);
    nested = nested[key];
  }
  return object;
}
var _baseSet_default = baseSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_basePickBy.js
function basePickBy(object, paths, predicate) {
  var index = -1, length = paths.length, result = {};
  while (++index < length) {
    var path = paths[index], value = _baseGet_default(object, path);
    if (predicate(value, path)) {
      _baseSet_default(result, _castPath_default(path, object), value);
    }
  }
  return result;
}
var _basePickBy_default = basePickBy;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseSortBy.js
function baseSortBy(array, comparer) {
  var length = array.length;
  array.sort(comparer);
  while (length--) {
    array[length] = array[length].value;
  }
  return array;
}
var _baseSortBy_default = baseSortBy;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_compareAscending.js
function compareAscending(value, other) {
  if (value !== other) {
    var valIsDefined = value !== undefined, valIsNull = value === null, valIsReflexive = value === value, valIsSymbol = isSymbol_default(value);
    var othIsDefined = other !== undefined, othIsNull = other === null, othIsReflexive = other === other, othIsSymbol = isSymbol_default(other);
    if (!othIsNull && !othIsSymbol && !valIsSymbol && value > other || valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol || valIsNull && othIsDefined && othIsReflexive || !valIsDefined && othIsReflexive || !valIsReflexive) {
      return 1;
    }
    if (!valIsNull && !valIsSymbol && !othIsSymbol && value < other || othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol || othIsNull && valIsDefined && valIsReflexive || !othIsDefined && valIsReflexive || !othIsReflexive) {
      return -1;
    }
  }
  return 0;
}
var _compareAscending_default = compareAscending;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_compareMultiple.js
function compareMultiple(object, other, orders) {
  var index = -1, objCriteria = object.criteria, othCriteria = other.criteria, length = objCriteria.length, ordersLength = orders.length;
  while (++index < length) {
    var result = _compareAscending_default(objCriteria[index], othCriteria[index]);
    if (result) {
      if (index >= ordersLength) {
        return result;
      }
      var order = orders[index];
      return result * (order == "desc" ? -1 : 1);
    }
  }
  return object.index - other.index;
}
var _compareMultiple_default = compareMultiple;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseOrderBy.js
function baseOrderBy(collection, iteratees, orders) {
  if (iteratees.length) {
    iteratees = _arrayMap_default(iteratees, function(iteratee) {
      if (isArray_default(iteratee)) {
        return function(value) {
          return _baseGet_default(value, iteratee.length === 1 ? iteratee[0] : iteratee);
        };
      }
      return iteratee;
    });
  } else {
    iteratees = [identity_default];
  }
  var index = -1;
  iteratees = _arrayMap_default(iteratees, _baseUnary_default(_baseIteratee_default));
  var result = _baseMap_default(collection, function(value, key, collection) {
    var criteria = _arrayMap_default(iteratees, function(iteratee) {
      return iteratee(value);
    });
    return { criteria, index: ++index, value };
  });
  return _baseSortBy_default(result, function(object, other) {
    return _compareMultiple_default(object, other, orders);
  });
}
var _baseOrderBy_default = baseOrderBy;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_asciiSize.js
var asciiSize = _baseProperty_default("length");
var _asciiSize_default = asciiSize;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_unicodeSize.js
var rsAstralRange2 = "\\ud800-\\udfff";
var rsComboMarksRange2 = "\\u0300-\\u036f";
var reComboHalfMarksRange2 = "\\ufe20-\\ufe2f";
var rsComboSymbolsRange2 = "\\u20d0-\\u20ff";
var rsComboRange2 = rsComboMarksRange2 + reComboHalfMarksRange2 + rsComboSymbolsRange2;
var rsVarRange2 = "\\ufe0e\\ufe0f";
var rsAstral = "[" + rsAstralRange2 + "]";
var rsCombo = "[" + rsComboRange2 + "]";
var rsFitz = "\\ud83c[\\udffb-\\udfff]";
var rsModifier = "(?:" + rsCombo + "|" + rsFitz + ")";
var rsNonAstral = "[^" + rsAstralRange2 + "]";
var rsRegional = "(?:\\ud83c[\\udde6-\\uddff]){2}";
var rsSurrPair = "[\\ud800-\\udbff][\\udc00-\\udfff]";
var rsZWJ2 = "\\u200d";
var reOptMod = rsModifier + "?";
var rsOptVar = "[" + rsVarRange2 + "]?";
var rsOptJoin = "(?:" + rsZWJ2 + "(?:" + [rsNonAstral, rsRegional, rsSurrPair].join("|") + ")" + rsOptVar + reOptMod + ")*";
var rsSeq = rsOptVar + reOptMod + rsOptJoin;
var rsSymbol = "(?:" + [rsNonAstral + rsCombo + "?", rsCombo, rsRegional, rsSurrPair, rsAstral].join("|") + ")";
var reUnicode = RegExp(rsFitz + "(?=" + rsFitz + ")|" + rsSymbol + rsSeq, "g");
function unicodeSize(string) {
  var result = reUnicode.lastIndex = 0;
  while (reUnicode.test(string)) {
    ++result;
  }
  return result;
}
var _unicodeSize_default = unicodeSize;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_stringSize.js
function stringSize(string) {
  return _hasUnicode_default(string) ? _unicodeSize_default(string) : _asciiSize_default(string);
}
var _stringSize_default = stringSize;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_basePick.js
function basePick(object, paths) {
  return _basePickBy_default(object, paths, function(value, path) {
    return hasIn_default(object, path);
  });
}
var _basePick_default = basePick;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/pick.js
var pick = _flatRest_default(function(object, paths) {
  return object == null ? {} : _basePick_default(object, paths);
});
var pick_default = pick;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseRange.js
var nativeCeil = Math.ceil;
var nativeMax3 = Math.max;
function baseRange(start, end, step, fromRight) {
  var index = -1, length = nativeMax3(nativeCeil((end - start) / (step || 1)), 0), result = Array(length);
  while (length--) {
    result[fromRight ? length : ++index] = start;
    start += step;
  }
  return result;
}
var _baseRange_default = baseRange;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_createRange.js
function createRange(fromRight) {
  return function(start, end, step) {
    if (step && typeof step != "number" && _isIterateeCall_default(start, end, step)) {
      end = step = undefined;
    }
    start = toFinite_default(start);
    if (end === undefined) {
      end = start;
      start = 0;
    } else {
      end = toFinite_default(end);
    }
    step = step === undefined ? start < end ? 1 : -1 : toFinite_default(step);
    return _baseRange_default(start, end, step, fromRight);
  };
}
var _createRange_default = createRange;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/range.js
var range = _createRange_default();
var range_default = range;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseReduce.js
function baseReduce(collection, iteratee, accumulator, initAccum, eachFunc) {
  eachFunc(collection, function(value, index, collection) {
    accumulator = initAccum ? (initAccum = false, value) : iteratee(accumulator, value, index, collection);
  });
  return accumulator;
}
var _baseReduce_default = baseReduce;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/reduce.js
function reduce(collection, iteratee, accumulator) {
  var func = isArray_default(collection) ? _arrayReduce_default : _baseReduce_default, initAccum = arguments.length < 3;
  return func(collection, _baseIteratee_default(iteratee, 4), accumulator, initAccum, _baseEach_default);
}
var reduce_default = reduce;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/size.js
var mapTag8 = "[object Map]";
var setTag8 = "[object Set]";
function size(collection) {
  if (collection == null) {
    return 0;
  }
  if (isArrayLike_default(collection)) {
    return isString_default(collection) ? _stringSize_default(collection) : collection.length;
  }
  var tag = _getTag_default(collection);
  if (tag == mapTag8 || tag == setTag8) {
    return collection.size;
  }
  return _baseKeys_default(collection).length;
}
var size_default = size;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/sortBy.js
var sortBy = _baseRest_default(function(collection, iteratees) {
  if (collection == null) {
    return [];
  }
  var length = iteratees.length;
  if (length > 1 && _isIterateeCall_default(collection, iteratees[0], iteratees[1])) {
    iteratees = [];
  } else if (length > 2 && _isIterateeCall_default(iteratees[0], iteratees[1], iteratees[2])) {
    iteratees = [iteratees[0]];
  }
  return _baseOrderBy_default(collection, _baseFlatten_default(iteratees, 1), []);
});
var sortBy_default = sortBy;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_createSet.js
var INFINITY4 = 1 / 0;
var createSet = !(_Set_default && 1 / _setToArray_default(new _Set_default([, -0]))[1] == INFINITY4) ? noop_default : function(values) {
  return new _Set_default(values);
};
var _createSet_default = createSet;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseUniq.js
var LARGE_ARRAY_SIZE2 = 200;
function baseUniq(array, iteratee, comparator) {
  var index = -1, includes = _arrayIncludes_default, length = array.length, isCommon = true, result = [], seen = result;
  if (comparator) {
    isCommon = false;
    includes = _arrayIncludesWith_default;
  } else if (length >= LARGE_ARRAY_SIZE2) {
    var set = iteratee ? null : _createSet_default(array);
    if (set) {
      return _setToArray_default(set);
    }
    isCommon = false;
    includes = _cacheHas_default;
    seen = new _SetCache_default;
  } else {
    seen = iteratee ? [] : result;
  }
  outer:
    while (++index < length) {
      var value = array[index], computed = iteratee ? iteratee(value) : value;
      value = comparator || value !== 0 ? value : 0;
      if (isCommon && computed === computed) {
        var seenIndex = seen.length;
        while (seenIndex--) {
          if (seen[seenIndex] === computed) {
            continue outer;
          }
        }
        if (iteratee) {
          seen.push(computed);
        }
        result.push(value);
      } else if (!includes(seen, computed, comparator)) {
        if (seen !== result) {
          seen.push(computed);
        }
        result.push(value);
      }
    }
  return result;
}
var _baseUniq_default = baseUniq;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/union.js
var union = _baseRest_default(function(arrays) {
  return _baseUniq_default(_baseFlatten_default(arrays, 1, isArrayLikeObject_default, true));
});
var union_default = union;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/uniqueId.js
var idCounter = 0;
function uniqueId(prefix) {
  var id = ++idCounter;
  return toString_default(prefix) + id;
}
var uniqueId_default = uniqueId;
// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/_baseZipObject.js
function baseZipObject(props, values, assignFunc) {
  var index = -1, length = props.length, valsLength = values.length, result = {};
  while (++index < length) {
    var value = index < valsLength ? values[index] : undefined;
    assignFunc(result, props[index], value);
  }
  return result;
}
var _baseZipObject_default = baseZipObject;

// ../../../../../../../../.bun/install/cache/lodash-es@4.18.1@@@1/zipObject.js
function zipObject(props, values) {
  return _baseZipObject_default(props || [], values || [], _assignValue_default);
}
var zipObject_default = zipObject;
// node_modules/dagre-d3-es/src/graphlib/graph.js
var DEFAULT_EDGE_NAME = "\x00";
var GRAPH_NODE = "\x00";
var EDGE_KEY_DELIM = "\x01";

class Graph {
  constructor(opts = {}) {
    this._isDirected = Object.prototype.hasOwnProperty.call(opts, "directed") ? opts.directed : true;
    this._isMultigraph = Object.prototype.hasOwnProperty.call(opts, "multigraph") ? opts.multigraph : false;
    this._isCompound = Object.prototype.hasOwnProperty.call(opts, "compound") ? opts.compound : false;
    this._label = undefined;
    this._defaultNodeLabelFn = constant_default(undefined);
    this._defaultEdgeLabelFn = constant_default(undefined);
    this._nodes = {};
    if (this._isCompound) {
      this._parent = {};
      this._children = {};
      this._children[GRAPH_NODE] = {};
    }
    this._in = {};
    this._preds = {};
    this._out = {};
    this._sucs = {};
    this._edgeObjs = {};
    this._edgeLabels = {};
  }
  isDirected() {
    return this._isDirected;
  }
  isMultigraph() {
    return this._isMultigraph;
  }
  isCompound() {
    return this._isCompound;
  }
  setGraph(label) {
    this._label = label;
    return this;
  }
  graph() {
    return this._label;
  }
  setDefaultNodeLabel(newDefault) {
    if (!isFunction_default(newDefault)) {
      newDefault = constant_default(newDefault);
    }
    this._defaultNodeLabelFn = newDefault;
    return this;
  }
  nodeCount() {
    return this._nodeCount;
  }
  nodes() {
    return keys_default(this._nodes);
  }
  sources() {
    var self2 = this;
    return filter_default(this.nodes(), function(v) {
      return isEmpty_default(self2._in[v]);
    });
  }
  sinks() {
    var self2 = this;
    return filter_default(this.nodes(), function(v) {
      return isEmpty_default(self2._out[v]);
    });
  }
  setNodes(vs, value) {
    var args = arguments;
    var self2 = this;
    forEach_default(vs, function(v) {
      if (args.length > 1) {
        self2.setNode(v, value);
      } else {
        self2.setNode(v);
      }
    });
    return this;
  }
  setNode(v, value) {
    if (Object.prototype.hasOwnProperty.call(this._nodes, v)) {
      if (arguments.length > 1) {
        this._nodes[v] = value;
      }
      return this;
    }
    this._nodes[v] = arguments.length > 1 ? value : this._defaultNodeLabelFn(v);
    if (this._isCompound) {
      this._parent[v] = GRAPH_NODE;
      this._children[v] = {};
      this._children[GRAPH_NODE][v] = true;
    }
    this._in[v] = {};
    this._preds[v] = {};
    this._out[v] = {};
    this._sucs[v] = {};
    ++this._nodeCount;
    return this;
  }
  node(v) {
    return this._nodes[v];
  }
  hasNode(v) {
    return Object.prototype.hasOwnProperty.call(this._nodes, v);
  }
  removeNode(v) {
    if (Object.prototype.hasOwnProperty.call(this._nodes, v)) {
      var removeEdge = (e) => this.removeEdge(this._edgeObjs[e]);
      delete this._nodes[v];
      if (this._isCompound) {
        this._removeFromParentsChildList(v);
        delete this._parent[v];
        forEach_default(this.children(v), (child) => {
          this.setParent(child);
        });
        delete this._children[v];
      }
      forEach_default(keys_default(this._in[v]), removeEdge);
      delete this._in[v];
      delete this._preds[v];
      forEach_default(keys_default(this._out[v]), removeEdge);
      delete this._out[v];
      delete this._sucs[v];
      --this._nodeCount;
    }
    return this;
  }
  setParent(v, parent) {
    if (!this._isCompound) {
      throw new Error("Cannot set parent in a non-compound graph");
    }
    if (isUndefined_default(parent)) {
      parent = GRAPH_NODE;
    } else {
      parent += "";
      for (var ancestor = parent;!isUndefined_default(ancestor); ancestor = this.parent(ancestor)) {
        if (ancestor === v) {
          throw new Error("Setting " + parent + " as parent of " + v + " would create a cycle");
        }
      }
      this.setNode(parent);
    }
    this.setNode(v);
    this._removeFromParentsChildList(v);
    this._parent[v] = parent;
    this._children[parent][v] = true;
    return this;
  }
  _removeFromParentsChildList(v) {
    delete this._children[this._parent[v]][v];
  }
  parent(v) {
    if (this._isCompound) {
      var parent = this._parent[v];
      if (parent !== GRAPH_NODE) {
        return parent;
      }
    }
  }
  children(v) {
    if (isUndefined_default(v)) {
      v = GRAPH_NODE;
    }
    if (this._isCompound) {
      var children = this._children[v];
      if (children) {
        return keys_default(children);
      }
    } else if (v === GRAPH_NODE) {
      return this.nodes();
    } else if (this.hasNode(v)) {
      return [];
    }
  }
  predecessors(v) {
    var predsV = this._preds[v];
    if (predsV) {
      return keys_default(predsV);
    }
  }
  successors(v) {
    var sucsV = this._sucs[v];
    if (sucsV) {
      return keys_default(sucsV);
    }
  }
  neighbors(v) {
    var preds = this.predecessors(v);
    if (preds) {
      return union_default(preds, this.successors(v));
    }
  }
  isLeaf(v) {
    var neighbors;
    if (this.isDirected()) {
      neighbors = this.successors(v);
    } else {
      neighbors = this.neighbors(v);
    }
    return neighbors.length === 0;
  }
  filterNodes(filter) {
    var copy = new this.constructor({
      directed: this._isDirected,
      multigraph: this._isMultigraph,
      compound: this._isCompound
    });
    copy.setGraph(this.graph());
    var self2 = this;
    forEach_default(this._nodes, function(value, v) {
      if (filter(v)) {
        copy.setNode(v, value);
      }
    });
    forEach_default(this._edgeObjs, function(e) {
      if (copy.hasNode(e.v) && copy.hasNode(e.w)) {
        copy.setEdge(e, self2.edge(e));
      }
    });
    var parents = {};
    function findParent(v) {
      var parent = self2.parent(v);
      if (parent === undefined || copy.hasNode(parent)) {
        parents[v] = parent;
        return parent;
      } else if (parent in parents) {
        return parents[parent];
      } else {
        return findParent(parent);
      }
    }
    if (this._isCompound) {
      forEach_default(copy.nodes(), function(v) {
        copy.setParent(v, findParent(v));
      });
    }
    return copy;
  }
  setDefaultEdgeLabel(newDefault) {
    if (!isFunction_default(newDefault)) {
      newDefault = constant_default(newDefault);
    }
    this._defaultEdgeLabelFn = newDefault;
    return this;
  }
  edgeCount() {
    return this._edgeCount;
  }
  edges() {
    return values_default(this._edgeObjs);
  }
  setPath(vs, value) {
    var self2 = this;
    var args = arguments;
    reduce_default(vs, function(v, w) {
      if (args.length > 1) {
        self2.setEdge(v, w, value);
      } else {
        self2.setEdge(v, w);
      }
      return w;
    });
    return this;
  }
  setEdge() {
    var v, w, name, value;
    var valueSpecified = false;
    var arg0 = arguments[0];
    if (typeof arg0 === "object" && arg0 !== null && "v" in arg0) {
      v = arg0.v;
      w = arg0.w;
      name = arg0.name;
      if (arguments.length === 2) {
        value = arguments[1];
        valueSpecified = true;
      }
    } else {
      v = arg0;
      w = arguments[1];
      name = arguments[3];
      if (arguments.length > 2) {
        value = arguments[2];
        valueSpecified = true;
      }
    }
    v = "" + v;
    w = "" + w;
    if (!isUndefined_default(name)) {
      name = "" + name;
    }
    var e = edgeArgsToId(this._isDirected, v, w, name);
    if (Object.prototype.hasOwnProperty.call(this._edgeLabels, e)) {
      if (valueSpecified) {
        this._edgeLabels[e] = value;
      }
      return this;
    }
    if (!isUndefined_default(name) && !this._isMultigraph) {
      throw new Error("Cannot set a named edge when isMultigraph = false");
    }
    this.setNode(v);
    this.setNode(w);
    this._edgeLabels[e] = valueSpecified ? value : this._defaultEdgeLabelFn(v, w, name);
    var edgeObj = edgeArgsToObj(this._isDirected, v, w, name);
    v = edgeObj.v;
    w = edgeObj.w;
    Object.freeze(edgeObj);
    this._edgeObjs[e] = edgeObj;
    incrementOrInitEntry(this._preds[w], v);
    incrementOrInitEntry(this._sucs[v], w);
    this._in[w][e] = edgeObj;
    this._out[v][e] = edgeObj;
    this._edgeCount++;
    return this;
  }
  edge(v, w, name) {
    var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
    return this._edgeLabels[e];
  }
  hasEdge(v, w, name) {
    var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
    return Object.prototype.hasOwnProperty.call(this._edgeLabels, e);
  }
  removeEdge(v, w, name) {
    var e = arguments.length === 1 ? edgeObjToId(this._isDirected, arguments[0]) : edgeArgsToId(this._isDirected, v, w, name);
    var edge = this._edgeObjs[e];
    if (edge) {
      v = edge.v;
      w = edge.w;
      delete this._edgeLabels[e];
      delete this._edgeObjs[e];
      decrementOrRemoveEntry(this._preds[w], v);
      decrementOrRemoveEntry(this._sucs[v], w);
      delete this._in[w][e];
      delete this._out[v][e];
      this._edgeCount--;
    }
    return this;
  }
  inEdges(v, u) {
    var inV = this._in[v];
    if (inV) {
      var edges = values_default(inV);
      if (!u) {
        return edges;
      }
      return filter_default(edges, function(edge) {
        return edge.v === u;
      });
    }
  }
  outEdges(v, w) {
    var outV = this._out[v];
    if (outV) {
      var edges = values_default(outV);
      if (!w) {
        return edges;
      }
      return filter_default(edges, function(edge) {
        return edge.w === w;
      });
    }
  }
  nodeEdges(v, w) {
    var inEdges = this.inEdges(v, w);
    if (inEdges) {
      return inEdges.concat(this.outEdges(v, w));
    }
  }
}
Graph.prototype._nodeCount = 0;
Graph.prototype._edgeCount = 0;
function incrementOrInitEntry(map, k) {
  if (map[k]) {
    map[k]++;
  } else {
    map[k] = 1;
  }
}
function decrementOrRemoveEntry(map, k) {
  if (!--map[k]) {
    delete map[k];
  }
}
function edgeArgsToId(isDirected, v_, w_, name) {
  var v = "" + v_;
  var w = "" + w_;
  if (!isDirected && v > w) {
    var tmp = v;
    v = w;
    w = tmp;
  }
  return v + EDGE_KEY_DELIM + w + EDGE_KEY_DELIM + (isUndefined_default(name) ? DEFAULT_EDGE_NAME : name);
}
function edgeArgsToObj(isDirected, v_, w_, name) {
  var v = "" + v_;
  var w = "" + w_;
  if (!isDirected && v > w) {
    var tmp = v;
    v = w;
    w = tmp;
  }
  var edgeObj = { v, w };
  if (name) {
    edgeObj.name = name;
  }
  return edgeObj;
}
function edgeObjToId(isDirected, edgeObj) {
  return edgeArgsToId(isDirected, edgeObj.v, edgeObj.w, edgeObj.name);
}

// node_modules/dagre-d3-es/src/dagre/data/list.js
class List {
  constructor() {
    var sentinel = {};
    sentinel._next = sentinel._prev = sentinel;
    this._sentinel = sentinel;
  }
  dequeue() {
    var sentinel = this._sentinel;
    var entry = sentinel._prev;
    if (entry !== sentinel) {
      unlink(entry);
      return entry;
    }
  }
  enqueue(entry) {
    var sentinel = this._sentinel;
    if (entry._prev && entry._next) {
      unlink(entry);
    }
    entry._next = sentinel._next;
    sentinel._next._prev = entry;
    sentinel._next = entry;
    entry._prev = sentinel;
  }
  toString() {
    var strs = [];
    var sentinel = this._sentinel;
    var curr = sentinel._prev;
    while (curr !== sentinel) {
      strs.push(JSON.stringify(curr, filterOutLinks));
      curr = curr._prev;
    }
    return "[" + strs.join(", ") + "]";
  }
}
function unlink(entry) {
  entry._prev._next = entry._next;
  entry._next._prev = entry._prev;
  delete entry._next;
  delete entry._prev;
}
function filterOutLinks(k, v) {
  if (k !== "_next" && k !== "_prev") {
    return v;
  }
}

// node_modules/dagre-d3-es/src/dagre/greedy-fas.js
var DEFAULT_WEIGHT_FN = constant_default(1);
function greedyFAS(g, weightFn) {
  if (g.nodeCount() <= 1) {
    return [];
  }
  var state = buildState(g, weightFn || DEFAULT_WEIGHT_FN);
  var results = doGreedyFAS(state.graph, state.buckets, state.zeroIdx);
  return flatten_default(map_default(results, function(e) {
    return g.outEdges(e.v, e.w);
  }));
}
function doGreedyFAS(g, buckets, zeroIdx) {
  var results = [];
  var sources = buckets[buckets.length - 1];
  var sinks = buckets[0];
  var entry;
  while (g.nodeCount()) {
    while (entry = sinks.dequeue()) {
      removeNode(g, buckets, zeroIdx, entry);
    }
    while (entry = sources.dequeue()) {
      removeNode(g, buckets, zeroIdx, entry);
    }
    if (g.nodeCount()) {
      for (var i = buckets.length - 2;i > 0; --i) {
        entry = buckets[i].dequeue();
        if (entry) {
          results = results.concat(removeNode(g, buckets, zeroIdx, entry, true));
          break;
        }
      }
    }
  }
  return results;
}
function removeNode(g, buckets, zeroIdx, entry, collectPredecessors) {
  var results = collectPredecessors ? [] : undefined;
  forEach_default(g.inEdges(entry.v), function(edge) {
    var weight = g.edge(edge);
    var uEntry = g.node(edge.v);
    if (collectPredecessors) {
      results.push({ v: edge.v, w: edge.w });
    }
    uEntry.out -= weight;
    assignBucket(buckets, zeroIdx, uEntry);
  });
  forEach_default(g.outEdges(entry.v), function(edge) {
    var weight = g.edge(edge);
    var w = edge.w;
    var wEntry = g.node(w);
    wEntry["in"] -= weight;
    assignBucket(buckets, zeroIdx, wEntry);
  });
  g.removeNode(entry.v);
  return results;
}
function buildState(g, weightFn) {
  var fasGraph = new Graph;
  var maxIn = 0;
  var maxOut = 0;
  forEach_default(g.nodes(), function(v) {
    fasGraph.setNode(v, { v, in: 0, out: 0 });
  });
  forEach_default(g.edges(), function(e) {
    var prevWeight = fasGraph.edge(e.v, e.w) || 0;
    var weight = weightFn(e);
    var edgeWeight = prevWeight + weight;
    fasGraph.setEdge(e.v, e.w, edgeWeight);
    maxOut = Math.max(maxOut, fasGraph.node(e.v).out += weight);
    maxIn = Math.max(maxIn, fasGraph.node(e.w)["in"] += weight);
  });
  var buckets = range_default(maxOut + maxIn + 3).map(function() {
    return new List;
  });
  var zeroIdx = maxIn + 1;
  forEach_default(fasGraph.nodes(), function(v) {
    assignBucket(buckets, zeroIdx, fasGraph.node(v));
  });
  return { graph: fasGraph, buckets, zeroIdx };
}
function assignBucket(buckets, zeroIdx, entry) {
  if (!entry.out) {
    buckets[0].enqueue(entry);
  } else if (!entry["in"]) {
    buckets[buckets.length - 1].enqueue(entry);
  } else {
    buckets[entry.out - entry["in"] + zeroIdx].enqueue(entry);
  }
}

// node_modules/dagre-d3-es/src/dagre/acyclic.js
function run(g) {
  var fas = g.graph().acyclicer === "greedy" ? greedyFAS(g, weightFn(g)) : dfsFAS(g);
  forEach_default(fas, function(e) {
    var label = g.edge(e);
    g.removeEdge(e);
    label.forwardName = e.name;
    label.reversed = true;
    g.setEdge(e.w, e.v, label, uniqueId_default("rev"));
  });
  function weightFn(g) {
    return function(e) {
      return g.edge(e).weight;
    };
  }
}
function dfsFAS(g) {
  var fas = [];
  var stack = {};
  var visited = {};
  function dfs(v) {
    if (Object.prototype.hasOwnProperty.call(visited, v)) {
      return;
    }
    visited[v] = true;
    stack[v] = true;
    forEach_default(g.outEdges(v), function(e) {
      if (Object.prototype.hasOwnProperty.call(stack, e.w)) {
        fas.push(e);
      } else {
        dfs(e.w);
      }
    });
    delete stack[v];
  }
  forEach_default(g.nodes(), dfs);
  return fas;
}
function undo(g) {
  forEach_default(g.edges(), function(e) {
    var label = g.edge(e);
    if (label.reversed) {
      g.removeEdge(e);
      var forwardName = label.forwardName;
      delete label.reversed;
      delete label.forwardName;
      g.setEdge(e.w, e.v, label, forwardName);
    }
  });
}

// node_modules/dagre-d3-es/src/dagre/util.js
function addDummyNode(g, type, attrs, name) {
  var v;
  do {
    v = uniqueId_default(name);
  } while (g.hasNode(v));
  attrs.dummy = type;
  g.setNode(v, attrs);
  return v;
}
function simplify(g) {
  var simplified = new Graph().setGraph(g.graph());
  forEach_default(g.nodes(), function(v) {
    simplified.setNode(v, g.node(v));
  });
  forEach_default(g.edges(), function(e) {
    var simpleLabel = simplified.edge(e.v, e.w) || { weight: 0, minlen: 1 };
    var label = g.edge(e);
    simplified.setEdge(e.v, e.w, {
      weight: simpleLabel.weight + label.weight,
      minlen: Math.max(simpleLabel.minlen, label.minlen)
    });
  });
  return simplified;
}
function asNonCompoundGraph(g) {
  var simplified = new Graph({ multigraph: g.isMultigraph() }).setGraph(g.graph());
  forEach_default(g.nodes(), function(v) {
    if (!g.children(v).length) {
      simplified.setNode(v, g.node(v));
    }
  });
  forEach_default(g.edges(), function(e) {
    simplified.setEdge(e, g.edge(e));
  });
  return simplified;
}
function intersectRect(rect, point) {
  var x = rect.x;
  var y = rect.y;
  var dx = point.x - x;
  var dy = point.y - y;
  var w = rect.width / 2;
  var h = rect.height / 2;
  if (!dx && !dy) {
    throw new Error("Not possible to find intersection inside of the rectangle");
  }
  var sx, sy;
  if (Math.abs(dy) * w > Math.abs(dx) * h) {
    if (dy < 0) {
      h = -h;
    }
    sx = h * dx / dy;
    sy = h;
  } else {
    if (dx < 0) {
      w = -w;
    }
    sx = w;
    sy = w * dy / dx;
  }
  return { x: x + sx, y: y + sy };
}
function buildLayerMatrix(g) {
  var layering = map_default(range_default(maxRank(g) + 1), function() {
    return [];
  });
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v);
    var rank = node.rank;
    if (!isUndefined_default(rank)) {
      layering[rank][node.order] = v;
    }
  });
  return layering;
}
function normalizeRanks(g) {
  var min = min_default(map_default(g.nodes(), function(v) {
    return g.node(v).rank;
  }));
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v);
    if (has_default(node, "rank")) {
      node.rank -= min;
    }
  });
}
function removeEmptyRanks(g) {
  var offset = min_default(map_default(g.nodes(), function(v) {
    return g.node(v).rank;
  }));
  var layers = [];
  forEach_default(g.nodes(), function(v) {
    var rank = g.node(v).rank - offset;
    if (!layers[rank]) {
      layers[rank] = [];
    }
    layers[rank].push(v);
  });
  var delta = 0;
  var nodeRankFactor = g.graph().nodeRankFactor;
  forEach_default(layers, function(vs, i) {
    if (isUndefined_default(vs) && i % nodeRankFactor !== 0) {
      --delta;
    } else if (delta) {
      forEach_default(vs, function(v) {
        g.node(v).rank += delta;
      });
    }
  });
}
function addBorderNode(g, prefix, rank, order) {
  var node = {
    width: 0,
    height: 0
  };
  if (arguments.length >= 4) {
    node.rank = rank;
    node.order = order;
  }
  return addDummyNode(g, "border", node, prefix);
}
function maxRank(g) {
  return max_default(map_default(g.nodes(), function(v) {
    var rank = g.node(v).rank;
    if (!isUndefined_default(rank)) {
      return rank;
    }
  }));
}
function partition(collection, fn) {
  var result = { lhs: [], rhs: [] };
  forEach_default(collection, function(value) {
    if (fn(value)) {
      result.lhs.push(value);
    } else {
      result.rhs.push(value);
    }
  });
  return result;
}
function time(name, fn) {
  var start = now_default();
  try {
    return fn();
  } finally {
    console.log(name + " time: " + (now_default() - start) + "ms");
  }
}
function notime(name, fn) {
  return fn();
}

// node_modules/dagre-d3-es/src/dagre/add-border-segments.js
function addBorderSegments(g) {
  function dfs(v) {
    var children = g.children(v);
    var node = g.node(v);
    if (children.length) {
      forEach_default(children, dfs);
    }
    if (Object.prototype.hasOwnProperty.call(node, "minRank")) {
      node.borderLeft = [];
      node.borderRight = [];
      for (var rank = node.minRank, maxRank = node.maxRank + 1;rank < maxRank; ++rank) {
        addBorderNode2(g, "borderLeft", "_bl", v, node, rank);
        addBorderNode2(g, "borderRight", "_br", v, node, rank);
      }
    }
  }
  forEach_default(g.children(), dfs);
}
function addBorderNode2(g, prop, prefix, sg, sgNode, rank) {
  var label = { width: 0, height: 0, rank, borderType: prop };
  var prev = sgNode[prop][rank - 1];
  var curr = addDummyNode(g, "border", label, prefix);
  sgNode[prop][rank] = curr;
  g.setParent(curr, sg);
  if (prev) {
    g.setEdge(prev, curr, { weight: 1 });
  }
}

// node_modules/dagre-d3-es/src/dagre/coordinate-system.js
function adjust(g) {
  var rankDir = g.graph().rankdir.toLowerCase();
  if (rankDir === "lr" || rankDir === "rl") {
    swapWidthHeight(g);
  }
}
function undo2(g) {
  var rankDir = g.graph().rankdir.toLowerCase();
  if (rankDir === "bt" || rankDir === "rl") {
    reverseY(g);
  }
  if (rankDir === "lr" || rankDir === "rl") {
    swapXY(g);
    swapWidthHeight(g);
  }
}
function swapWidthHeight(g) {
  forEach_default(g.nodes(), function(v) {
    swapWidthHeightOne(g.node(v));
  });
  forEach_default(g.edges(), function(e) {
    swapWidthHeightOne(g.edge(e));
  });
}
function swapWidthHeightOne(attrs) {
  var w = attrs.width;
  attrs.width = attrs.height;
  attrs.height = w;
}
function reverseY(g) {
  forEach_default(g.nodes(), function(v) {
    reverseYOne(g.node(v));
  });
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    forEach_default(edge.points, reverseYOne);
    if (Object.prototype.hasOwnProperty.call(edge, "y")) {
      reverseYOne(edge);
    }
  });
}
function reverseYOne(attrs) {
  attrs.y = -attrs.y;
}
function swapXY(g) {
  forEach_default(g.nodes(), function(v) {
    swapXYOne(g.node(v));
  });
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    forEach_default(edge.points, swapXYOne);
    if (Object.prototype.hasOwnProperty.call(edge, "x")) {
      swapXYOne(edge);
    }
  });
}
function swapXYOne(attrs) {
  var x = attrs.x;
  attrs.x = attrs.y;
  attrs.y = x;
}

// node_modules/dagre-d3-es/src/dagre/normalize.js
function run2(g) {
  g.graph().dummyChains = [];
  forEach_default(g.edges(), function(edge) {
    normalizeEdge(g, edge);
  });
}
function normalizeEdge(g, e) {
  var v = e.v;
  var vRank = g.node(v).rank;
  var w = e.w;
  var wRank = g.node(w).rank;
  var name = e.name;
  var edgeLabel = g.edge(e);
  var labelRank = edgeLabel.labelRank;
  if (wRank === vRank + 1)
    return;
  g.removeEdge(e);
  var attrs = undefined;
  var dummy, i;
  for (i = 0, ++vRank;vRank < wRank; ++i, ++vRank) {
    edgeLabel.points = [];
    attrs = {
      width: 0,
      height: 0,
      edgeLabel,
      edgeObj: e,
      rank: vRank
    };
    dummy = addDummyNode(g, "edge", attrs, "_d");
    if (vRank === labelRank) {
      attrs.width = edgeLabel.width;
      attrs.height = edgeLabel.height;
      attrs.dummy = "edge-label";
      attrs.labelpos = edgeLabel.labelpos;
    }
    g.setEdge(v, dummy, { weight: edgeLabel.weight }, name);
    if (i === 0) {
      g.graph().dummyChains.push(dummy);
    }
    v = dummy;
  }
  g.setEdge(v, w, { weight: edgeLabel.weight }, name);
}
function undo3(g) {
  forEach_default(g.graph().dummyChains, function(v) {
    var node = g.node(v);
    var origLabel = node.edgeLabel;
    var w;
    g.setEdge(node.edgeObj, origLabel);
    while (node.dummy) {
      w = g.successors(v)[0];
      g.removeNode(v);
      origLabel.points.push({ x: node.x, y: node.y });
      if (node.dummy === "edge-label") {
        origLabel.x = node.x;
        origLabel.y = node.y;
        origLabel.width = node.width;
        origLabel.height = node.height;
      }
      v = w;
      node = g.node(v);
    }
  });
}

// node_modules/dagre-d3-es/src/dagre/rank/util.js
function longestPath(g) {
  var visited = {};
  function dfs(v) {
    var label = g.node(v);
    if (Object.prototype.hasOwnProperty.call(visited, v)) {
      return label.rank;
    }
    visited[v] = true;
    var rank = min_default(map_default(g.outEdges(v), function(e) {
      return dfs(e.w) - g.edge(e).minlen;
    }));
    if (rank === Number.POSITIVE_INFINITY || rank === undefined || rank === null) {
      rank = 0;
    }
    return label.rank = rank;
  }
  forEach_default(g.sources(), dfs);
}
function slack(g, e) {
  return g.node(e.w).rank - g.node(e.v).rank - g.edge(e).minlen;
}

// node_modules/dagre-d3-es/src/dagre/rank/feasible-tree.js
function feasibleTree(g) {
  var t = new Graph({ directed: false });
  var start = g.nodes()[0];
  var size = g.nodeCount();
  t.setNode(start, {});
  var edge, delta;
  while (tightTree(t, g) < size) {
    edge = findMinSlackEdge(t, g);
    delta = t.hasNode(edge.v) ? slack(g, edge) : -slack(g, edge);
    shiftRanks(t, g, delta);
  }
  return t;
}
function tightTree(t, g) {
  function dfs(v) {
    forEach_default(g.nodeEdges(v), function(e) {
      var edgeV = e.v, w = v === edgeV ? e.w : edgeV;
      if (!t.hasNode(w) && !slack(g, e)) {
        t.setNode(w, {});
        t.setEdge(v, w, {});
        dfs(w);
      }
    });
  }
  forEach_default(t.nodes(), dfs);
  return t.nodeCount();
}
function findMinSlackEdge(t, g) {
  return minBy_default(g.edges(), function(e) {
    if (t.hasNode(e.v) !== t.hasNode(e.w)) {
      return slack(g, e);
    }
  });
}
function shiftRanks(t, g, delta) {
  forEach_default(t.nodes(), function(v) {
    g.node(v).rank += delta;
  });
}

// node_modules/dagre-d3-es/src/graphlib/alg/dijkstra.js
var DEFAULT_WEIGHT_FUNC = constant_default(1);

// node_modules/dagre-d3-es/src/graphlib/alg/floyd-warshall.js
var DEFAULT_WEIGHT_FUNC2 = constant_default(1);

// node_modules/dagre-d3-es/src/graphlib/alg/topsort.js
topsort.CycleException = CycleException;
function topsort(g) {
  var visited = {};
  var stack = {};
  var results = [];
  function visit(node) {
    if (Object.prototype.hasOwnProperty.call(stack, node)) {
      throw new CycleException;
    }
    if (!Object.prototype.hasOwnProperty.call(visited, node)) {
      stack[node] = true;
      visited[node] = true;
      forEach_default(g.predecessors(node), visit);
      delete stack[node];
      results.push(node);
    }
  }
  forEach_default(g.sinks(), visit);
  if (size_default(visited) !== g.nodeCount()) {
    throw new CycleException;
  }
  return results;
}
function CycleException() {}
CycleException.prototype = new Error;

// node_modules/dagre-d3-es/src/graphlib/alg/dfs.js
function dfs(g, vs, order) {
  if (!isArray_default(vs)) {
    vs = [vs];
  }
  var navigation = (g.isDirected() ? g.successors : g.neighbors).bind(g);
  var acc = [];
  var visited = {};
  forEach_default(vs, function(v) {
    if (!g.hasNode(v)) {
      throw new Error("Graph does not have node: " + v);
    }
    doDfs(g, v, order === "post", visited, navigation, acc);
  });
  return acc;
}
function doDfs(g, v, postorder, visited, navigation, acc) {
  if (!Object.prototype.hasOwnProperty.call(visited, v)) {
    visited[v] = true;
    if (!postorder) {
      acc.push(v);
    }
    forEach_default(navigation(v), function(w) {
      doDfs(g, w, postorder, visited, navigation, acc);
    });
    if (postorder) {
      acc.push(v);
    }
  }
}

// node_modules/dagre-d3-es/src/graphlib/alg/postorder.js
function postorder(g, vs) {
  return dfs(g, vs, "post");
}

// node_modules/dagre-d3-es/src/graphlib/alg/preorder.js
function preorder(g, vs) {
  return dfs(g, vs, "pre");
}

// node_modules/dagre-d3-es/src/dagre/rank/network-simplex.js
networkSimplex.initLowLimValues = initLowLimValues;
networkSimplex.initCutValues = initCutValues;
networkSimplex.calcCutValue = calcCutValue;
networkSimplex.leaveEdge = leaveEdge;
networkSimplex.enterEdge = enterEdge;
networkSimplex.exchangeEdges = exchangeEdges;
function networkSimplex(g) {
  g = simplify(g);
  longestPath(g);
  var t = feasibleTree(g);
  initLowLimValues(t);
  initCutValues(t, g);
  var e, f;
  while (e = leaveEdge(t)) {
    f = enterEdge(t, g, e);
    exchangeEdges(t, g, e, f);
  }
}
function initCutValues(t, g) {
  var vs = postorder(t, t.nodes());
  vs = vs.slice(0, vs.length - 1);
  forEach_default(vs, function(v) {
    assignCutValue(t, g, v);
  });
}
function assignCutValue(t, g, child) {
  var childLab = t.node(child);
  var parent = childLab.parent;
  t.edge(child, parent).cutvalue = calcCutValue(t, g, child);
}
function calcCutValue(t, g, child) {
  var childLab = t.node(child);
  var parent = childLab.parent;
  var childIsTail = true;
  var graphEdge = g.edge(child, parent);
  var cutValue = 0;
  if (!graphEdge) {
    childIsTail = false;
    graphEdge = g.edge(parent, child);
  }
  cutValue = graphEdge.weight;
  forEach_default(g.nodeEdges(child), function(e) {
    var isOutEdge = e.v === child, other = isOutEdge ? e.w : e.v;
    if (other !== parent) {
      var pointsToHead = isOutEdge === childIsTail, otherWeight = g.edge(e).weight;
      cutValue += pointsToHead ? otherWeight : -otherWeight;
      if (isTreeEdge(t, child, other)) {
        var otherCutValue = t.edge(child, other).cutvalue;
        cutValue += pointsToHead ? -otherCutValue : otherCutValue;
      }
    }
  });
  return cutValue;
}
function initLowLimValues(tree, root) {
  if (arguments.length < 2) {
    root = tree.nodes()[0];
  }
  dfsAssignLowLim(tree, {}, 1, root);
}
function dfsAssignLowLim(tree, visited, nextLim, v, parent) {
  var low = nextLim;
  var label = tree.node(v);
  visited[v] = true;
  forEach_default(tree.neighbors(v), function(w) {
    if (!Object.prototype.hasOwnProperty.call(visited, w)) {
      nextLim = dfsAssignLowLim(tree, visited, nextLim, w, v);
    }
  });
  label.low = low;
  label.lim = nextLim++;
  if (parent) {
    label.parent = parent;
  } else {
    delete label.parent;
  }
  return nextLim;
}
function leaveEdge(tree) {
  return find_default(tree.edges(), function(e) {
    return tree.edge(e).cutvalue < 0;
  });
}
function enterEdge(t, g, edge) {
  var v = edge.v;
  var w = edge.w;
  if (!g.hasEdge(v, w)) {
    v = edge.w;
    w = edge.v;
  }
  var vLabel = t.node(v);
  var wLabel = t.node(w);
  var tailLabel = vLabel;
  var flip = false;
  if (vLabel.lim > wLabel.lim) {
    tailLabel = wLabel;
    flip = true;
  }
  var candidates = filter_default(g.edges(), function(edge) {
    return flip === isDescendant(t, t.node(edge.v), tailLabel) && flip !== isDescendant(t, t.node(edge.w), tailLabel);
  });
  return minBy_default(candidates, function(edge) {
    return slack(g, edge);
  });
}
function exchangeEdges(t, g, e, f) {
  var v = e.v;
  var w = e.w;
  t.removeEdge(v, w);
  t.setEdge(f.v, f.w, {});
  initLowLimValues(t);
  initCutValues(t, g);
  updateRanks(t, g);
}
function updateRanks(t, g) {
  var root = find_default(t.nodes(), function(v) {
    return !g.node(v).parent;
  });
  var vs = preorder(t, root);
  vs = vs.slice(1);
  forEach_default(vs, function(v) {
    var parent = t.node(v).parent, edge = g.edge(v, parent), flipped = false;
    if (!edge) {
      edge = g.edge(parent, v);
      flipped = true;
    }
    g.node(v).rank = g.node(parent).rank + (flipped ? edge.minlen : -edge.minlen);
  });
}
function isTreeEdge(tree, u, v) {
  return tree.hasEdge(u, v);
}
function isDescendant(tree, vLabel, rootLabel) {
  return rootLabel.low <= vLabel.lim && vLabel.lim <= rootLabel.lim;
}

// node_modules/dagre-d3-es/src/dagre/rank/index.js
function rank(g) {
  switch (g.graph().ranker) {
    case "network-simplex":
      networkSimplexRanker(g);
      break;
    case "tight-tree":
      tightTreeRanker(g);
      break;
    case "longest-path":
      longestPathRanker(g);
      break;
    default:
      networkSimplexRanker(g);
  }
}
var longestPathRanker = longestPath;
function tightTreeRanker(g) {
  longestPath(g);
  feasibleTree(g);
}
function networkSimplexRanker(g) {
  networkSimplex(g);
}

// node_modules/dagre-d3-es/src/dagre/nesting-graph.js
function run3(g) {
  var root = addDummyNode(g, "root", {}, "_root");
  var depths = treeDepths(g);
  var height = max_default(values_default(depths)) - 1;
  var nodeSep = 2 * height + 1;
  g.graph().nestingRoot = root;
  forEach_default(g.edges(), function(e) {
    g.edge(e).minlen *= nodeSep;
  });
  var weight = sumWeights(g) + 1;
  forEach_default(g.children(), function(child) {
    dfs2(g, root, nodeSep, weight, height, depths, child);
  });
  g.graph().nodeRankFactor = nodeSep;
}
function dfs2(g, root, nodeSep, weight, height, depths, v) {
  var children = g.children(v);
  if (!children.length) {
    if (v !== root) {
      g.setEdge(root, v, { weight: 0, minlen: nodeSep });
    }
    return;
  }
  var top = addBorderNode(g, "_bt");
  var bottom = addBorderNode(g, "_bb");
  var label = g.node(v);
  g.setParent(top, v);
  label.borderTop = top;
  g.setParent(bottom, v);
  label.borderBottom = bottom;
  forEach_default(children, function(child) {
    dfs2(g, root, nodeSep, weight, height, depths, child);
    var childNode = g.node(child);
    var childTop = childNode.borderTop ? childNode.borderTop : child;
    var childBottom = childNode.borderBottom ? childNode.borderBottom : child;
    var thisWeight = childNode.borderTop ? weight : 2 * weight;
    var minlen = childTop !== childBottom ? 1 : height - depths[v] + 1;
    g.setEdge(top, childTop, {
      weight: thisWeight,
      minlen,
      nestingEdge: true
    });
    g.setEdge(childBottom, bottom, {
      weight: thisWeight,
      minlen,
      nestingEdge: true
    });
  });
  if (!g.parent(v)) {
    g.setEdge(root, top, { weight: 0, minlen: height + depths[v] });
  }
}
function treeDepths(g) {
  var depths = {};
  function dfs(v, depth) {
    var children = g.children(v);
    if (children && children.length) {
      forEach_default(children, function(child) {
        dfs(child, depth + 1);
      });
    }
    depths[v] = depth;
  }
  forEach_default(g.children(), function(v) {
    dfs(v, 1);
  });
  return depths;
}
function sumWeights(g) {
  return reduce_default(g.edges(), function(acc, e) {
    return acc + g.edge(e).weight;
  }, 0);
}
function cleanup(g) {
  var graphLabel = g.graph();
  g.removeNode(graphLabel.nestingRoot);
  delete graphLabel.nestingRoot;
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    if (edge.nestingEdge) {
      g.removeEdge(e);
    }
  });
}

// node_modules/dagre-d3-es/src/dagre/order/add-subgraph-constraints.js
function addSubgraphConstraints(g, cg, vs) {
  var prev = {}, rootPrev;
  forEach_default(vs, function(v) {
    var child = g.parent(v), parent, prevChild;
    while (child) {
      parent = g.parent(child);
      if (parent) {
        prevChild = prev[parent];
        prev[parent] = child;
      } else {
        prevChild = rootPrev;
        rootPrev = child;
      }
      if (prevChild && prevChild !== child) {
        cg.setEdge(prevChild, child);
        return;
      }
      child = parent;
    }
  });
}

// node_modules/dagre-d3-es/src/dagre/order/build-layer-graph.js
function buildLayerGraph(g, rank, relationship) {
  var root = createRootNode(g), result = new Graph({ compound: true }).setGraph({ root }).setDefaultNodeLabel(function(v) {
    return g.node(v);
  });
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v), parent = g.parent(v);
    if (node.rank === rank || node.minRank <= rank && rank <= node.maxRank) {
      result.setNode(v);
      result.setParent(v, parent || root);
      forEach_default(g[relationship](v), function(e) {
        var u = e.v === v ? e.w : e.v, edge = result.edge(u, v), weight = !isUndefined_default(edge) ? edge.weight : 0;
        result.setEdge(u, v, { weight: g.edge(e).weight + weight });
      });
      if (Object.prototype.hasOwnProperty.call(node, "minRank")) {
        result.setNode(v, {
          borderLeft: node.borderLeft[rank],
          borderRight: node.borderRight[rank]
        });
      }
    }
  });
  return result;
}
function createRootNode(g) {
  var v;
  while (g.hasNode(v = uniqueId_default("_root")))
    ;
  return v;
}

// node_modules/dagre-d3-es/src/dagre/order/cross-count.js
function crossCount(g, layering) {
  var cc = 0;
  for (var i = 1;i < layering.length; ++i) {
    cc += twoLayerCrossCount(g, layering[i - 1], layering[i]);
  }
  return cc;
}
function twoLayerCrossCount(g, northLayer, southLayer) {
  var southPos = zipObject_default(southLayer, map_default(southLayer, function(v, i) {
    return i;
  }));
  var southEntries = flatten_default(map_default(northLayer, function(v) {
    return sortBy_default(map_default(g.outEdges(v), function(e) {
      return { pos: southPos[e.w], weight: g.edge(e).weight };
    }), "pos");
  }));
  var firstIndex = 1;
  while (firstIndex < southLayer.length)
    firstIndex <<= 1;
  var treeSize = 2 * firstIndex - 1;
  firstIndex -= 1;
  var tree = map_default(new Array(treeSize), function() {
    return 0;
  });
  var cc = 0;
  forEach_default(southEntries.forEach(function(entry) {
    var index = entry.pos + firstIndex;
    tree[index] += entry.weight;
    var weightSum = 0;
    while (index > 0) {
      if (index % 2) {
        weightSum += tree[index + 1];
      }
      index = index - 1 >> 1;
      tree[index] += entry.weight;
    }
    cc += entry.weight * weightSum;
  }));
  return cc;
}

// node_modules/dagre-d3-es/src/dagre/order/init-order.js
function initOrder(g) {
  var visited = {};
  var simpleNodes = filter_default(g.nodes(), function(v) {
    return !g.children(v).length;
  });
  var maxRank = max_default(map_default(simpleNodes, function(v) {
    return g.node(v).rank;
  }));
  var layers = map_default(range_default(maxRank + 1), function() {
    return [];
  });
  function dfs(v) {
    if (has_default(visited, v))
      return;
    visited[v] = true;
    var node = g.node(v);
    layers[node.rank].push(v);
    forEach_default(g.successors(v), dfs);
  }
  var orderedVs = sortBy_default(simpleNodes, function(v) {
    return g.node(v).rank;
  });
  forEach_default(orderedVs, dfs);
  return layers;
}

// node_modules/dagre-d3-es/src/dagre/order/barycenter.js
function barycenter(g, movable) {
  return map_default(movable, function(v) {
    var inV = g.inEdges(v);
    if (!inV.length) {
      return { v };
    } else {
      var result = reduce_default(inV, function(acc, e) {
        var edge = g.edge(e), nodeU = g.node(e.v);
        return {
          sum: acc.sum + edge.weight * nodeU.order,
          weight: acc.weight + edge.weight
        };
      }, { sum: 0, weight: 0 });
      return {
        v,
        barycenter: result.sum / result.weight,
        weight: result.weight
      };
    }
  });
}

// node_modules/dagre-d3-es/src/dagre/order/resolve-conflicts.js
function resolveConflicts(entries, cg) {
  var mappedEntries = {};
  forEach_default(entries, function(entry, i) {
    var tmp = mappedEntries[entry.v] = {
      indegree: 0,
      in: [],
      out: [],
      vs: [entry.v],
      i
    };
    if (!isUndefined_default(entry.barycenter)) {
      tmp.barycenter = entry.barycenter;
      tmp.weight = entry.weight;
    }
  });
  forEach_default(cg.edges(), function(e) {
    var entryV = mappedEntries[e.v];
    var entryW = mappedEntries[e.w];
    if (!isUndefined_default(entryV) && !isUndefined_default(entryW)) {
      entryW.indegree++;
      entryV.out.push(mappedEntries[e.w]);
    }
  });
  var sourceSet = filter_default(mappedEntries, function(entry) {
    return !entry.indegree;
  });
  return doResolveConflicts(sourceSet);
}
function doResolveConflicts(sourceSet) {
  var entries = [];
  function handleIn(vEntry) {
    return function(uEntry) {
      if (uEntry.merged) {
        return;
      }
      if (isUndefined_default(uEntry.barycenter) || isUndefined_default(vEntry.barycenter) || uEntry.barycenter >= vEntry.barycenter) {
        mergeEntries(vEntry, uEntry);
      }
    };
  }
  function handleOut(vEntry) {
    return function(wEntry) {
      wEntry["in"].push(vEntry);
      if (--wEntry.indegree === 0) {
        sourceSet.push(wEntry);
      }
    };
  }
  while (sourceSet.length) {
    var entry = sourceSet.pop();
    entries.push(entry);
    forEach_default(entry["in"].reverse(), handleIn(entry));
    forEach_default(entry.out, handleOut(entry));
  }
  return map_default(filter_default(entries, function(entry) {
    return !entry.merged;
  }), function(entry) {
    return pick_default(entry, ["vs", "i", "barycenter", "weight"]);
  });
}
function mergeEntries(target, source) {
  var sum = 0;
  var weight = 0;
  if (target.weight) {
    sum += target.barycenter * target.weight;
    weight += target.weight;
  }
  if (source.weight) {
    sum += source.barycenter * source.weight;
    weight += source.weight;
  }
  target.vs = source.vs.concat(target.vs);
  target.barycenter = sum / weight;
  target.weight = weight;
  target.i = Math.min(source.i, target.i);
  source.merged = true;
}

// node_modules/dagre-d3-es/src/dagre/order/sort.js
function sort(entries, biasRight) {
  var parts = partition(entries, function(entry) {
    return Object.prototype.hasOwnProperty.call(entry, "barycenter");
  });
  var sortable = parts.lhs, unsortable = sortBy_default(parts.rhs, function(entry) {
    return -entry.i;
  }), vs = [], sum = 0, weight = 0, vsIndex = 0;
  sortable.sort(compareWithBias(!!biasRight));
  vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
  forEach_default(sortable, function(entry) {
    vsIndex += entry.vs.length;
    vs.push(entry.vs);
    sum += entry.barycenter * entry.weight;
    weight += entry.weight;
    vsIndex = consumeUnsortable(vs, unsortable, vsIndex);
  });
  var result = { vs: flatten_default(vs) };
  if (weight) {
    result.barycenter = sum / weight;
    result.weight = weight;
  }
  return result;
}
function consumeUnsortable(vs, unsortable, index) {
  var last;
  while (unsortable.length && (last = last_default(unsortable)).i <= index) {
    unsortable.pop();
    vs.push(last.vs);
    index++;
  }
  return index;
}
function compareWithBias(bias) {
  return function(entryV, entryW) {
    if (entryV.barycenter < entryW.barycenter) {
      return -1;
    } else if (entryV.barycenter > entryW.barycenter) {
      return 1;
    }
    return !bias ? entryV.i - entryW.i : entryW.i - entryV.i;
  };
}

// node_modules/dagre-d3-es/src/dagre/order/sort-subgraph.js
function sortSubgraph(g, v, cg, biasRight) {
  var movable = g.children(v);
  var node = g.node(v);
  var bl = node ? node.borderLeft : undefined;
  var br = node ? node.borderRight : undefined;
  var subgraphs = {};
  if (bl) {
    movable = filter_default(movable, function(w) {
      return w !== bl && w !== br;
    });
  }
  var barycenters = barycenter(g, movable);
  forEach_default(barycenters, function(entry) {
    if (g.children(entry.v).length) {
      var subgraphResult = sortSubgraph(g, entry.v, cg, biasRight);
      subgraphs[entry.v] = subgraphResult;
      if (Object.prototype.hasOwnProperty.call(subgraphResult, "barycenter")) {
        mergeBarycenters(entry, subgraphResult);
      }
    }
  });
  var entries = resolveConflicts(barycenters, cg);
  expandSubgraphs(entries, subgraphs);
  var result = sort(entries, biasRight);
  if (bl) {
    result.vs = flatten_default([bl, result.vs, br]);
    if (g.predecessors(bl).length) {
      var blPred = g.node(g.predecessors(bl)[0]), brPred = g.node(g.predecessors(br)[0]);
      if (!Object.prototype.hasOwnProperty.call(result, "barycenter")) {
        result.barycenter = 0;
        result.weight = 0;
      }
      result.barycenter = (result.barycenter * result.weight + blPred.order + brPred.order) / (result.weight + 2);
      result.weight += 2;
    }
  }
  return result;
}
function expandSubgraphs(entries, subgraphs) {
  forEach_default(entries, function(entry) {
    entry.vs = flatten_default(entry.vs.map(function(v) {
      if (subgraphs[v]) {
        return subgraphs[v].vs;
      }
      return v;
    }));
  });
}
function mergeBarycenters(target, other) {
  if (!isUndefined_default(target.barycenter)) {
    target.barycenter = (target.barycenter * target.weight + other.barycenter * other.weight) / (target.weight + other.weight);
    target.weight += other.weight;
  } else {
    target.barycenter = other.barycenter;
    target.weight = other.weight;
  }
}

// node_modules/dagre-d3-es/src/dagre/order/index.js
function order(g) {
  var maxRank2 = maxRank(g), downLayerGraphs = buildLayerGraphs(g, range_default(1, maxRank2 + 1), "inEdges"), upLayerGraphs = buildLayerGraphs(g, range_default(maxRank2 - 1, -1, -1), "outEdges");
  var layering = initOrder(g);
  assignOrder(g, layering);
  var bestCC = Number.POSITIVE_INFINITY, best;
  for (var i = 0, lastBest = 0;lastBest < 4; ++i, ++lastBest) {
    sweepLayerGraphs(i % 2 ? downLayerGraphs : upLayerGraphs, i % 4 >= 2);
    layering = buildLayerMatrix(g);
    var cc = crossCount(g, layering);
    if (cc < bestCC) {
      lastBest = 0;
      best = cloneDeep_default(layering);
      bestCC = cc;
    }
  }
  assignOrder(g, best);
}
function buildLayerGraphs(g, ranks, relationship) {
  return map_default(ranks, function(rank) {
    return buildLayerGraph(g, rank, relationship);
  });
}
function sweepLayerGraphs(layerGraphs, biasRight) {
  var cg = new Graph;
  forEach_default(layerGraphs, function(lg) {
    var root = lg.graph().root;
    var sorted = sortSubgraph(lg, root, cg, biasRight);
    forEach_default(sorted.vs, function(v, i) {
      lg.node(v).order = i;
    });
    addSubgraphConstraints(lg, cg, sorted.vs);
  });
}
function assignOrder(g, layering) {
  forEach_default(layering, function(layer) {
    forEach_default(layer, function(v, i) {
      g.node(v).order = i;
    });
  });
}

// node_modules/dagre-d3-es/src/dagre/parent-dummy-chains.js
function parentDummyChains(g) {
  var postorderNums = postorder2(g);
  forEach_default(g.graph().dummyChains, function(v) {
    var node = g.node(v);
    var edgeObj = node.edgeObj;
    var pathData = findPath(g, postorderNums, edgeObj.v, edgeObj.w);
    var path = pathData.path;
    var lca = pathData.lca;
    var pathIdx = 0;
    var pathV = path[pathIdx];
    var ascending = true;
    while (v !== edgeObj.w) {
      node = g.node(v);
      if (ascending) {
        while ((pathV = path[pathIdx]) !== lca && g.node(pathV).maxRank < node.rank) {
          pathIdx++;
        }
        if (pathV === lca) {
          ascending = false;
        }
      }
      if (!ascending) {
        while (pathIdx < path.length - 1 && g.node(pathV = path[pathIdx + 1]).minRank <= node.rank) {
          pathIdx++;
        }
        pathV = path[pathIdx];
      }
      g.setParent(v, pathV);
      v = g.successors(v)[0];
    }
  });
}
function findPath(g, postorderNums, v, w) {
  var vPath = [];
  var wPath = [];
  var low = Math.min(postorderNums[v].low, postorderNums[w].low);
  var lim = Math.max(postorderNums[v].lim, postorderNums[w].lim);
  var parent;
  var lca;
  parent = v;
  do {
    parent = g.parent(parent);
    vPath.push(parent);
  } while (parent && (postorderNums[parent].low > low || lim > postorderNums[parent].lim));
  lca = parent;
  parent = w;
  while ((parent = g.parent(parent)) !== lca) {
    wPath.push(parent);
  }
  return { path: vPath.concat(wPath.reverse()), lca };
}
function postorder2(g) {
  var result = {};
  var lim = 0;
  function dfs(v) {
    var low = lim;
    forEach_default(g.children(v), dfs);
    result[v] = { low, lim: lim++ };
  }
  forEach_default(g.children(), dfs);
  return result;
}

// node_modules/dagre-d3-es/src/dagre/position/bk.js
function findType1Conflicts(g, layering) {
  var conflicts = {};
  function visitLayer(prevLayer, layer) {
    var k0 = 0, scanPos = 0, prevLayerLength = prevLayer.length, lastNode = last_default(layer);
    forEach_default(layer, function(v, i) {
      var w = findOtherInnerSegmentNode(g, v), k1 = w ? g.node(w).order : prevLayerLength;
      if (w || v === lastNode) {
        forEach_default(layer.slice(scanPos, i + 1), function(scanNode) {
          forEach_default(g.predecessors(scanNode), function(u) {
            var uLabel = g.node(u), uPos = uLabel.order;
            if ((uPos < k0 || k1 < uPos) && !(uLabel.dummy && g.node(scanNode).dummy)) {
              addConflict(conflicts, u, scanNode);
            }
          });
        });
        scanPos = i + 1;
        k0 = k1;
      }
    });
    return layer;
  }
  reduce_default(layering, visitLayer);
  return conflicts;
}
function findType2Conflicts(g, layering) {
  var conflicts = {};
  function scan(south, southPos, southEnd, prevNorthBorder, nextNorthBorder) {
    var v;
    forEach_default(range_default(southPos, southEnd), function(i) {
      v = south[i];
      if (g.node(v).dummy) {
        forEach_default(g.predecessors(v), function(u) {
          var uNode = g.node(u);
          if (uNode.dummy && (uNode.order < prevNorthBorder || uNode.order > nextNorthBorder)) {
            addConflict(conflicts, u, v);
          }
        });
      }
    });
  }
  function visitLayer(north, south) {
    var prevNorthPos = -1, nextNorthPos, southPos = 0;
    forEach_default(south, function(v, southLookahead) {
      if (g.node(v).dummy === "border") {
        var predecessors = g.predecessors(v);
        if (predecessors.length) {
          nextNorthPos = g.node(predecessors[0]).order;
          scan(south, southPos, southLookahead, prevNorthPos, nextNorthPos);
          southPos = southLookahead;
          prevNorthPos = nextNorthPos;
        }
      }
      scan(south, southPos, south.length, nextNorthPos, north.length);
    });
    return south;
  }
  reduce_default(layering, visitLayer);
  return conflicts;
}
function findOtherInnerSegmentNode(g, v) {
  if (g.node(v).dummy) {
    return find_default(g.predecessors(v), function(u) {
      return g.node(u).dummy;
    });
  }
}
function addConflict(conflicts, v, w) {
  if (v > w) {
    var tmp = v;
    v = w;
    w = tmp;
  }
  if (!Object.prototype.hasOwnProperty.call(conflicts, v)) {
    Object.defineProperty(conflicts, v, {
      enumerable: true,
      configurable: true,
      value: {},
      writable: true
    });
  }
  var conflictsV = conflicts[v];
  Object.defineProperty(conflictsV, w, {
    enumerable: true,
    configurable: true,
    value: true,
    writable: true
  });
}
function hasConflict(conflicts, v, w) {
  if (v > w) {
    var tmp = v;
    v = w;
    w = tmp;
  }
  return !!conflicts[v] && Object.prototype.hasOwnProperty.call(conflicts[v], w);
}
function verticalAlignment(g, layering, conflicts, neighborFn) {
  var root = {}, align = {}, pos = {};
  forEach_default(layering, function(layer) {
    forEach_default(layer, function(v, order) {
      root[v] = v;
      align[v] = v;
      pos[v] = order;
    });
  });
  forEach_default(layering, function(layer) {
    var prevIdx = -1;
    forEach_default(layer, function(v) {
      var ws = neighborFn(v);
      if (ws.length) {
        ws = sortBy_default(ws, function(w) {
          return pos[w];
        });
        var mp = (ws.length - 1) / 2;
        for (var i = Math.floor(mp), il = Math.ceil(mp);i <= il; ++i) {
          var w = ws[i];
          if (align[v] === v && prevIdx < pos[w] && !hasConflict(conflicts, v, w)) {
            align[w] = v;
            align[v] = root[v] = root[w];
            prevIdx = pos[w];
          }
        }
      }
    });
  });
  return { root, align };
}
function horizontalCompaction(g, layering, root, align, reverseSep) {
  var xs = {}, blockG = buildBlockGraph(g, layering, root, reverseSep), borderType = reverseSep ? "borderLeft" : "borderRight";
  function iterate(setXsFunc, nextNodesFunc) {
    var stack = blockG.nodes();
    var elem = stack.pop();
    var visited = {};
    while (elem) {
      if (visited[elem]) {
        setXsFunc(elem);
      } else {
        visited[elem] = true;
        stack.push(elem);
        stack = stack.concat(nextNodesFunc(elem));
      }
      elem = stack.pop();
    }
  }
  function pass1(elem) {
    xs[elem] = blockG.inEdges(elem).reduce(function(acc, e) {
      return Math.max(acc, xs[e.v] + blockG.edge(e));
    }, 0);
  }
  function pass2(elem) {
    var min = blockG.outEdges(elem).reduce(function(acc, e) {
      return Math.min(acc, xs[e.w] - blockG.edge(e));
    }, Number.POSITIVE_INFINITY);
    var node = g.node(elem);
    if (min !== Number.POSITIVE_INFINITY && node.borderType !== borderType) {
      xs[elem] = Math.max(xs[elem], min);
    }
  }
  iterate(pass1, blockG.predecessors.bind(blockG));
  iterate(pass2, blockG.successors.bind(blockG));
  forEach_default(align, function(v) {
    xs[v] = xs[root[v]];
  });
  return xs;
}
function buildBlockGraph(g, layering, root, reverseSep) {
  var blockGraph = new Graph, graphLabel = g.graph(), sepFn = sep(graphLabel.nodesep, graphLabel.edgesep, reverseSep);
  forEach_default(layering, function(layer) {
    var u;
    forEach_default(layer, function(v) {
      var vRoot = root[v];
      blockGraph.setNode(vRoot);
      if (u) {
        var uRoot = root[u], prevMax = blockGraph.edge(uRoot, vRoot);
        blockGraph.setEdge(uRoot, vRoot, Math.max(sepFn(g, v, u), prevMax || 0));
      }
      u = v;
    });
  });
  return blockGraph;
}
function findSmallestWidthAlignment(g, xss) {
  return minBy_default(values_default(xss), function(xs) {
    var max = Number.NEGATIVE_INFINITY;
    var min = Number.POSITIVE_INFINITY;
    forIn_default(xs, function(x, v) {
      var halfWidth = width(g, v) / 2;
      max = Math.max(x + halfWidth, max);
      min = Math.min(x - halfWidth, min);
    });
    return max - min;
  });
}
function alignCoordinates(xss, alignTo) {
  var alignToVals = values_default(alignTo), alignToMin = min_default(alignToVals), alignToMax = max_default(alignToVals);
  forEach_default(["u", "d"], function(vert) {
    forEach_default(["l", "r"], function(horiz) {
      var alignment = vert + horiz, xs = xss[alignment], delta;
      if (xs === alignTo)
        return;
      var xsVals = values_default(xs);
      delta = horiz === "l" ? alignToMin - min_default(xsVals) : alignToMax - max_default(xsVals);
      if (delta) {
        xss[alignment] = mapValues_default(xs, function(x) {
          return x + delta;
        });
      }
    });
  });
}
function balance(xss, align) {
  return mapValues_default(xss.ul, function(ignore, v) {
    if (align) {
      return xss[align.toLowerCase()][v];
    } else {
      var xs = sortBy_default(map_default(xss, v));
      return (xs[1] + xs[2]) / 2;
    }
  });
}
function positionX(g) {
  var layering = buildLayerMatrix(g);
  var conflicts = merge_default(findType1Conflicts(g, layering), findType2Conflicts(g, layering));
  var xss = {};
  var adjustedLayering;
  forEach_default(["u", "d"], function(vert) {
    adjustedLayering = vert === "u" ? layering : values_default(layering).reverse();
    forEach_default(["l", "r"], function(horiz) {
      if (horiz === "r") {
        adjustedLayering = map_default(adjustedLayering, function(inner) {
          return values_default(inner).reverse();
        });
      }
      var neighborFn = (vert === "u" ? g.predecessors : g.successors).bind(g);
      var align = verticalAlignment(g, adjustedLayering, conflicts, neighborFn);
      var xs = horizontalCompaction(g, adjustedLayering, align.root, align.align, horiz === "r");
      if (horiz === "r") {
        xs = mapValues_default(xs, function(x) {
          return -x;
        });
      }
      xss[vert + horiz] = xs;
    });
  });
  var smallestWidth = findSmallestWidthAlignment(g, xss);
  alignCoordinates(xss, smallestWidth);
  return balance(xss, g.graph().align);
}
function sep(nodeSep, edgeSep, reverseSep) {
  return function(g, v, w) {
    var vLabel = g.node(v);
    var wLabel = g.node(w);
    var sum = 0;
    var delta;
    sum += vLabel.width / 2;
    if (Object.prototype.hasOwnProperty.call(vLabel, "labelpos")) {
      switch (vLabel.labelpos.toLowerCase()) {
        case "l":
          delta = -vLabel.width / 2;
          break;
        case "r":
          delta = vLabel.width / 2;
          break;
      }
    }
    if (delta) {
      sum += reverseSep ? delta : -delta;
    }
    delta = 0;
    sum += (vLabel.dummy ? edgeSep : nodeSep) / 2;
    sum += (wLabel.dummy ? edgeSep : nodeSep) / 2;
    sum += wLabel.width / 2;
    if (Object.prototype.hasOwnProperty.call(wLabel, "labelpos")) {
      switch (wLabel.labelpos.toLowerCase()) {
        case "l":
          delta = wLabel.width / 2;
          break;
        case "r":
          delta = -wLabel.width / 2;
          break;
      }
    }
    if (delta) {
      sum += reverseSep ? delta : -delta;
    }
    delta = 0;
    return sum;
  };
}
function width(g, v) {
  return g.node(v).width;
}

// node_modules/dagre-d3-es/src/dagre/position/index.js
function position(g) {
  g = asNonCompoundGraph(g);
  positionY(g);
  forOwn_default(positionX(g), function(x, v) {
    g.node(v).x = x;
  });
}
function positionY(g) {
  var layering = buildLayerMatrix(g);
  var rankSep = g.graph().ranksep;
  var prevY = 0;
  forEach_default(layering, function(layer) {
    var maxHeight = max_default(map_default(layer, function(v) {
      return g.node(v).height;
    }));
    forEach_default(layer, function(v) {
      g.node(v).y = prevY + maxHeight / 2;
    });
    prevY += maxHeight + rankSep;
  });
}

// node_modules/dagre-d3-es/src/dagre/layout.js
function layout(g, opts) {
  var time2 = opts && opts.debugTiming ? time : notime;
  time2("layout", () => {
    var layoutGraph = time2("  buildLayoutGraph", () => buildLayoutGraph(g));
    time2("  runLayout", () => runLayout(layoutGraph, time2));
    time2("  updateInputGraph", () => updateInputGraph(g, layoutGraph));
  });
}
function runLayout(g, time) {
  time("    makeSpaceForEdgeLabels", () => makeSpaceForEdgeLabels(g));
  time("    removeSelfEdges", () => removeSelfEdges(g));
  time("    acyclic", () => run(g));
  time("    nestingGraph.run", () => run3(g));
  time("    rank", () => rank(asNonCompoundGraph(g)));
  time("    injectEdgeLabelProxies", () => injectEdgeLabelProxies(g));
  time("    removeEmptyRanks", () => removeEmptyRanks(g));
  time("    nestingGraph.cleanup", () => cleanup(g));
  time("    normalizeRanks", () => normalizeRanks(g));
  time("    assignRankMinMax", () => assignRankMinMax(g));
  time("    removeEdgeLabelProxies", () => removeEdgeLabelProxies(g));
  time("    normalize.run", () => run2(g));
  time("    parentDummyChains", () => parentDummyChains(g));
  time("    addBorderSegments", () => addBorderSegments(g));
  time("    order", () => order(g));
  time("    insertSelfEdges", () => insertSelfEdges(g));
  time("    adjustCoordinateSystem", () => adjust(g));
  time("    position", () => position(g));
  time("    positionSelfEdges", () => positionSelfEdges(g));
  time("    removeBorderNodes", () => removeBorderNodes(g));
  time("    normalize.undo", () => undo3(g));
  time("    fixupEdgeLabelCoords", () => fixupEdgeLabelCoords(g));
  time("    undoCoordinateSystem", () => undo2(g));
  time("    translateGraph", () => translateGraph(g));
  time("    assignNodeIntersects", () => assignNodeIntersects(g));
  time("    reversePoints", () => reversePointsForReversedEdges(g));
  time("    acyclic.undo", () => undo(g));
}
function updateInputGraph(inputGraph, layoutGraph) {
  forEach_default(inputGraph.nodes(), function(v) {
    var inputLabel = inputGraph.node(v);
    var layoutLabel = layoutGraph.node(v);
    if (inputLabel) {
      inputLabel.x = layoutLabel.x;
      inputLabel.y = layoutLabel.y;
      if (layoutGraph.children(v).length) {
        inputLabel.width = layoutLabel.width;
        inputLabel.height = layoutLabel.height;
      }
    }
  });
  forEach_default(inputGraph.edges(), function(e) {
    var inputLabel = inputGraph.edge(e);
    var layoutLabel = layoutGraph.edge(e);
    inputLabel.points = layoutLabel.points;
    if (Object.prototype.hasOwnProperty.call(layoutLabel, "x")) {
      inputLabel.x = layoutLabel.x;
      inputLabel.y = layoutLabel.y;
    }
  });
  inputGraph.graph().width = layoutGraph.graph().width;
  inputGraph.graph().height = layoutGraph.graph().height;
}
var graphNumAttrs = ["nodesep", "edgesep", "ranksep", "marginx", "marginy"];
var graphDefaults = { ranksep: 50, edgesep: 20, nodesep: 50, rankdir: "tb" };
var graphAttrs = ["acyclicer", "ranker", "rankdir", "align"];
var nodeNumAttrs = ["width", "height"];
var nodeDefaults = { width: 0, height: 0 };
var edgeNumAttrs = ["minlen", "weight", "width", "height", "labeloffset"];
var edgeDefaults = {
  minlen: 1,
  weight: 1,
  width: 0,
  height: 0,
  labeloffset: 10,
  labelpos: "r"
};
var edgeAttrs = ["labelpos"];
function buildLayoutGraph(inputGraph) {
  var g = new Graph({ multigraph: true, compound: true });
  var graph = canonicalize(inputGraph.graph());
  g.setGraph(merge_default({}, graphDefaults, selectNumberAttrs(graph, graphNumAttrs), pick_default(graph, graphAttrs)));
  forEach_default(inputGraph.nodes(), function(v) {
    var node = canonicalize(inputGraph.node(v));
    g.setNode(v, defaults_default(selectNumberAttrs(node, nodeNumAttrs), nodeDefaults));
    g.setParent(v, inputGraph.parent(v));
  });
  forEach_default(inputGraph.edges(), function(e) {
    var edge = canonicalize(inputGraph.edge(e));
    g.setEdge(e, merge_default({}, edgeDefaults, selectNumberAttrs(edge, edgeNumAttrs), pick_default(edge, edgeAttrs)));
  });
  return g;
}
function makeSpaceForEdgeLabels(g) {
  var graph = g.graph();
  graph.ranksep /= 2;
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    edge.minlen *= 2;
    if (edge.labelpos.toLowerCase() !== "c") {
      if (graph.rankdir === "TB" || graph.rankdir === "BT") {
        edge.width += edge.labeloffset;
      } else {
        edge.height += edge.labeloffset;
      }
    }
  });
}
function injectEdgeLabelProxies(g) {
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    if (edge.width && edge.height) {
      var v = g.node(e.v);
      var w = g.node(e.w);
      var label = { rank: (w.rank - v.rank) / 2 + v.rank, e };
      addDummyNode(g, "edge-proxy", label, "_ep");
    }
  });
}
function assignRankMinMax(g) {
  var maxRank = 0;
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v);
    if (node.borderTop) {
      node.minRank = g.node(node.borderTop).rank;
      node.maxRank = g.node(node.borderBottom).rank;
      maxRank = max_default(maxRank, node.maxRank);
    }
  });
  g.graph().maxRank = maxRank;
}
function removeEdgeLabelProxies(g) {
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v);
    if (node.dummy === "edge-proxy") {
      g.edge(node.e).labelRank = node.rank;
      g.removeNode(v);
    }
  });
}
function translateGraph(g) {
  var minX = Number.POSITIVE_INFINITY;
  var maxX = 0;
  var minY = Number.POSITIVE_INFINITY;
  var maxY = 0;
  var graphLabel = g.graph();
  var marginX = graphLabel.marginx || 0;
  var marginY = graphLabel.marginy || 0;
  function getExtremes(attrs) {
    var x = attrs.x;
    var y = attrs.y;
    var w = attrs.width;
    var h = attrs.height;
    minX = Math.min(minX, x - w / 2);
    maxX = Math.max(maxX, x + w / 2);
    minY = Math.min(minY, y - h / 2);
    maxY = Math.max(maxY, y + h / 2);
  }
  forEach_default(g.nodes(), function(v) {
    getExtremes(g.node(v));
  });
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    if (Object.prototype.hasOwnProperty.call(edge, "x")) {
      getExtremes(edge);
    }
  });
  minX -= marginX;
  minY -= marginY;
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v);
    node.x -= minX;
    node.y -= minY;
  });
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    forEach_default(edge.points, function(p) {
      p.x -= minX;
      p.y -= minY;
    });
    if (Object.prototype.hasOwnProperty.call(edge, "x")) {
      edge.x -= minX;
    }
    if (Object.prototype.hasOwnProperty.call(edge, "y")) {
      edge.y -= minY;
    }
  });
  graphLabel.width = maxX - minX + marginX;
  graphLabel.height = maxY - minY + marginY;
}
function assignNodeIntersects(g) {
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    var nodeV = g.node(e.v);
    var nodeW = g.node(e.w);
    var p1, p2;
    if (!edge.points) {
      edge.points = [];
      p1 = nodeW;
      p2 = nodeV;
    } else {
      p1 = edge.points[0];
      p2 = edge.points[edge.points.length - 1];
    }
    edge.points.unshift(intersectRect(nodeV, p1));
    edge.points.push(intersectRect(nodeW, p2));
  });
}
function fixupEdgeLabelCoords(g) {
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    if (Object.prototype.hasOwnProperty.call(edge, "x")) {
      if (edge.labelpos === "l" || edge.labelpos === "r") {
        edge.width -= edge.labeloffset;
      }
      switch (edge.labelpos) {
        case "l":
          edge.x -= edge.width / 2 + edge.labeloffset;
          break;
        case "r":
          edge.x += edge.width / 2 + edge.labeloffset;
          break;
      }
    }
  });
}
function reversePointsForReversedEdges(g) {
  forEach_default(g.edges(), function(e) {
    var edge = g.edge(e);
    if (edge.reversed) {
      edge.points.reverse();
    }
  });
}
function removeBorderNodes(g) {
  forEach_default(g.nodes(), function(v) {
    if (g.children(v).length) {
      var node = g.node(v);
      var t = g.node(node.borderTop);
      var b = g.node(node.borderBottom);
      var l = g.node(last_default(node.borderLeft));
      var r = g.node(last_default(node.borderRight));
      node.width = Math.abs(r.x - l.x);
      node.height = Math.abs(b.y - t.y);
      node.x = l.x + node.width / 2;
      node.y = t.y + node.height / 2;
    }
  });
  forEach_default(g.nodes(), function(v) {
    if (g.node(v).dummy === "border") {
      g.removeNode(v);
    }
  });
}
function removeSelfEdges(g) {
  forEach_default(g.edges(), function(e) {
    if (e.v === e.w) {
      var node = g.node(e.v);
      if (!node.selfEdges) {
        node.selfEdges = [];
      }
      node.selfEdges.push({ e, label: g.edge(e) });
      g.removeEdge(e);
    }
  });
}
function insertSelfEdges(g) {
  var layers = buildLayerMatrix(g);
  forEach_default(layers, function(layer) {
    var orderShift = 0;
    forEach_default(layer, function(v, i) {
      var node = g.node(v);
      node.order = i + orderShift;
      forEach_default(node.selfEdges, function(selfEdge) {
        addDummyNode(g, "selfedge", {
          width: selfEdge.label.width,
          height: selfEdge.label.height,
          rank: node.rank,
          order: i + ++orderShift,
          e: selfEdge.e,
          label: selfEdge.label
        }, "_se");
      });
      delete node.selfEdges;
    });
  });
}
function positionSelfEdges(g) {
  forEach_default(g.nodes(), function(v) {
    var node = g.node(v);
    if (node.dummy === "selfedge") {
      var selfNode = g.node(node.e.v);
      var x = selfNode.x + selfNode.width / 2;
      var y = selfNode.y;
      var dx = node.x - x;
      var dy = selfNode.height / 2;
      g.setEdge(node.e, node.label);
      g.removeNode(v);
      node.label.points = [
        { x: x + 2 * dx / 3, y: y - dy },
        { x: x + 5 * dx / 6, y: y - dy },
        { x: x + dx, y },
        { x: x + 5 * dx / 6, y: y + dy },
        { x: x + 2 * dx / 3, y: y + dy }
      ];
      node.label.x = node.x;
      node.label.y = node.y;
    }
  });
}
function selectNumberAttrs(obj, attrs) {
  return mapValues_default(pick_default(obj, attrs), Number);
}
function canonicalize(attrs) {
  var newAttrs = {};
  forEach_default(attrs, function(v, k) {
    newAttrs[k.toLowerCase()] = v;
  });
  return newAttrs;
}
export {
  Graph,
  layout
};
