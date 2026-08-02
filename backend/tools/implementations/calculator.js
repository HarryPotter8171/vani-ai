/**
 * Safe arithmetic calculator — no eval, no Function().
 * Supports + - * / % ^ and parentheses, with unary minus.
 */

function tokenize(expr) {
  const tokens = [];
  const src = String(expr).replace(/\s+/g, "");
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/[0-9.]/.test(ch)) {
      let num = ch;
      i += 1;
      while (i < src.length && /[0-9.]/.test(src[i])) {
        num += src[i];
        i += 1;
      }
      if ((num.match(/\./g) || []).length > 1) throw new Error("Invalid number");
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }
    if ("+-*/%^()".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    throw new Error(`Unsupported character: ${ch}`);
  }
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const ops = [];
  const prec = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3, "u-": 4 };
  const rightAssoc = new Set(["^", "u-"]);

  let prev = null;
  for (const token of tokens) {
    if (token.type === "number") {
      output.push(token);
      prev = token;
      continue;
    }

    let op = token.value;
    if (op === "-" && (prev == null || (prev.type === "op" && prev.value !== ")"))) {
      op = "u-";
    }

    if (op === "(") {
      ops.push(op);
      prev = token;
      continue;
    }
    if (op === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        output.push({ type: "op", value: ops.pop() });
      }
      if (!ops.length) throw new Error("Mismatched parentheses");
      ops.pop();
      prev = token;
      continue;
    }

    while (ops.length) {
      const top = ops[ops.length - 1];
      if (top === "(") break;
      const topPrec = prec[top] ?? 0;
      const curPrec = prec[op] ?? 0;
      if (topPrec > curPrec || (topPrec === curPrec && !rightAssoc.has(op))) {
        output.push({ type: "op", value: ops.pop() });
      } else break;
    }
    ops.push(op);
    prev = { type: "op", value: op };
  }

  while (ops.length) {
    const op = ops.pop();
    if (op === "(" || op === ")") throw new Error("Mismatched parentheses");
    output.push({ type: "op", value: op });
  }
  return output;
}

function evalRpn(rpn) {
  const stack = [];
  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }
    const op = token.value;
    if (op === "u-") {
      if (!stack.length) throw new Error("Invalid expression");
      stack.push(-stack.pop());
      continue;
    }
    if (stack.length < 2) throw new Error("Invalid expression");
    const b = stack.pop();
    const a = stack.pop();
    let result;
    switch (op) {
      case "+":
        result = a + b;
        break;
      case "-":
        result = a - b;
        break;
      case "*":
        result = a * b;
        break;
      case "/":
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
      case "%":
        if (b === 0) throw new Error("Division by zero");
        result = a % b;
        break;
      case "^":
        result = a ** b;
        break;
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
    if (!Number.isFinite(result)) throw new Error("Non-finite result");
    stack.push(result);
  }
  if (stack.length !== 1) throw new Error("Invalid expression");
  return stack[0];
}

export function evaluateExpression(expression) {
  const tokens = tokenize(expression);
  if (!tokens.length) throw new Error("Empty expression");
  return evalRpn(toRpn(tokens));
}

export const calculatorTool = {
  id: "calculator",
  name: "calculator",
  displayName: "Calculator",
  description:
    "Evaluate a precise arithmetic expression. Use for calculations, percentages, exponents, and multi-step math. Supports + - * / % ^ and parentheses.",
  schema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Math expression, e.g. '(12.5 * 4) + 3^2'",
      },
    },
    required: ["expression"],
    additionalProperties: false,
  },
  async execute(args = {}) {
    const expression = String(args.expression || "").trim();
    if (!expression) return { ok: false, error: "Expression is required" };
    if (expression.length > 200) return { ok: false, error: "Expression too long" };
    try {
      const result = evaluateExpression(expression);
      return { ok: true, expression, result };
    } catch (err) {
      return { ok: false, error: err.message || "Invalid expression", expression };
    }
  },
};
