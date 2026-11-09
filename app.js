(() => {
  'use strict';

  const resultEl = document.getElementById('result');
  const expressionEl = document.getElementById('expression');
  const keysEl = document.getElementById('keys');
  const historyListEl = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistory');

  const MAX_DIGITS = 12;
  const MAX_HISTORY = 40;
  const STORAGE_KEY = 'calculator.history.v1';
  const OPERATOR_SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  let state = createState();
  let history = loadHistory();

  function createState() {
    return {
      display: '0', // raw, parseable number string that is currently shown
      stored: null, // left-hand operand
      operator: null, // pending operator (+, -, *, /)
      waiting: false, // operator pressed, waiting for the second operand
      overwrite: true, // next digit should replace the display
      expression: '', // text on the small top line
      error: false,
      lastOperator: null, // used to repeat an operation on repeated "="
      lastOperand: null,
    };
  }

  /* ---------- Formatting ---------- */

  function toRaw(value) {
    if (!Number.isFinite(value)) return '0';
    const rounded = Number(value.toPrecision(12));
    const abs = Math.abs(rounded);
    if (rounded !== 0 && (abs >= 1e12 || abs < 1e-9)) {
      return rounded.toExponential(6);
    }
    return String(rounded);
  }

  function formatValue(value) {
    if (!Number.isFinite(value)) return 'Error';
    const rounded = Number(value.toPrecision(12));
    const abs = Math.abs(rounded);
    if (rounded !== 0 && (abs >= 1e12 || abs < 1e-9)) {
      return rounded.toExponential(6).replace('-', '−');
    }
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 }).replace('-', '−');
  }

  function groupDigits(raw) {
    if (raw.includes('e') || raw.includes('E')) return raw.replace('-', '−');

    const negative = raw.startsWith('-');
    const body = negative ? raw.slice(1) : raw;
    const dot = body.indexOf('.');
    const integer = dot === -1 ? body : body.slice(0, dot);
    const fraction = dot === -1 ? '' : body.slice(dot);
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '−' : ''}${grouped || '0'}${fraction}`;
  }

  function render() {
    const text = state.error ? 'Cannot divide by zero' : groupDigits(state.display);

    resultEl.textContent = text;
    resultEl.classList.toggle('is-error', state.error);
    resultEl.classList.toggle('is-compact', !state.error && text.length > 9 && text.length <= 13);
    resultEl.classList.toggle('is-tiny', !state.error && text.length > 13);
    expressionEl.textContent = state.error ? '' : state.expression;

    // Keep the least-significant digits in view if the number overflows.
    resultEl.scrollLeft = resultEl.scrollWidth;
    expressionEl.scrollLeft = expressionEl.scrollWidth;
  }

  /* ---------- Arithmetic ---------- */

  function compute(left, right, operator) {
    let result;
    switch (operator) {
      case '+':
        result = left + right;
        break;
      case '-':
        result = left - right;
        break;
      case '*':
        result = left * right;
        break;
      case '/':
        result = right === 0 ? NaN : left / right;
        break;
      default:
        return null;
    }
    if (!Number.isFinite(result)) return null;
    return Number(result.toPrecision(12));
  }

  /* ---------- Input handlers ---------- */

  function resetIfStartingNewCalculation() {
    if (state.operator === null) {
      state.stored = null;
      state.expression = '';
      state.lastOperator = null;
      state.lastOperand = null;
    }
  }

  function inputDigit(digit) {
    if (state.error) state = createState();

    if (state.overwrite) {
      resetIfStartingNewCalculation();
      state.display = digit;
      state.overwrite = false;
    } else {
      if (state.display.replace(/[^0-9]/g, '').length >= MAX_DIGITS) return;
      state.display = state.display === '0' ? digit : state.display + digit;
    }

    state.waiting = false;
    render();
  }

  function inputDecimal() {
    if (state.error) state = createState();

    if (state.overwrite) {
      resetIfStartingNewCalculation();
      state.display = '0.';
      state.overwrite = false;
    } else if (!state.display.includes('.')) {
      state.display += '.';
    }

    state.waiting = false;
    render();
  }

  function inputOperator(operator) {
    if (state.error) return;

    const value = parseFloat(state.display);
    if (!Number.isFinite(value)) return;

    if (state.operator !== null && !state.waiting) {
      const result = compute(state.stored, value, state.operator);
      if (result === null) {
        showError();
        return;
      }
      state.display = toRaw(result);
      state.stored = result;
    } else if (state.stored === null) {
      state.stored = value;
    }

    state.operator = operator;
    state.waiting = true;
    state.overwrite = true;
    state.lastOperator = null;
    state.lastOperand = null;
    state.expression = `${formatValue(state.stored)} ${OPERATOR_SYMBOLS[operator]}`;
    render();
  }

  function inputEquals() {
    if (state.error) return;

    if (state.operator !== null) {
      const left = state.stored;
      const right = parseFloat(state.display);
      const result = compute(left, right, state.operator);
      if (result === null) {
        showError();
        return;
      }

      const expression = `${formatValue(left)} ${OPERATOR_SYMBOLS[state.operator]} ${formatValue(right)} =`;
      state.lastOperator = state.operator;
      state.lastOperand = right;
      state.display = toRaw(result);
      state.stored = null;
      state.operator = null;
      state.waiting = false;
      state.overwrite = true;
      state.expression = expression;

      addHistory(expression, state.display);
      render();
      return;
    }

    // Pressing "=" again repeats the last operation.
    if (state.lastOperator !== null) {
      const left = parseFloat(state.display);
      const right = state.lastOperand;
      const result = compute(left, right, state.lastOperator);
      if (result === null) {
        showError();
        return;
      }

      const expression = `${formatValue(left)} ${OPERATOR_SYMBOLS[state.lastOperator]} ${formatValue(right)} =`;
      state.display = toRaw(result);
      state.overwrite = true;
      state.expression = expression;

      addHistory(expression, state.display);
      render();
    }
  }

  function inputPercent() {
    if (state.error) return;
    if (state.operator !== null && state.waiting) return;

    const value = parseFloat(state.display);
    const base = state.operator !== null && state.stored !== null ? state.stored : null;
    const result = base === null ? value / 100 : base * (value / 100);

    state.display = toRaw(result);
    state.overwrite = true;
    render();
  }

  function toggleSign() {
    if (state.error || state.waiting) return;
    if (state.display === '0') return;

    state.display = state.display.startsWith('-')
      ? state.display.slice(1)
      : `-${state.display}`;
    render();
  }

  function backspace() {
    if (state.error) {
      state = createState();
      render();
      return;
    }
    if (state.overwrite) return;

    state.display = state.display.slice(0, -1);
    if (state.display === '' || state.display === '-') state.display = '0';
    render();
  }

  function clearAll() {
    state = createState();
    render();
  }

  function showError() {
    state = createState();
    state.error = true;
    render();
  }

  /* ---------- History ---------- */

  function loadHistory() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (entry) =>
            entry &&
            typeof entry.expression === 'string' &&
            typeof entry.result === 'string' &&
            typeof entry.value === 'string'
        )
        .slice(0, MAX_HISTORY);
    } catch {
      return [];
    }
  }

  function persistHistory() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Storage can be unavailable (private mode, some file:// contexts). Ignore.
    }
  }

  function addHistory(expression, value) {
    history.unshift({
      expression,
      result: formatValue(parseFloat(value)),
      value,
    });
    history = history.slice(0, MAX_HISTORY);
    persistHistory();
    renderHistory();
  }

  function renderHistory() {
    historyListEl.replaceChildren();

    if (history.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'history__empty';
      empty.textContent = 'No calculations yet. Your results will appear here.';
      historyListEl.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const entry of history) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history__item';

      const expression = document.createElement('span');
      expression.className = 'history__expression';
      expression.textContent = entry.expression;

      const result = document.createElement('span');
      result.className = 'history__result';
      result.textContent = entry.result;

      button.append(expression, result);
      button.addEventListener('click', () => useHistoryEntry(entry));
      item.append(button);
      fragment.append(item);
    }

    historyListEl.append(fragment);
  }

  function useHistoryEntry(entry) {
    state = createState();
    state.display = entry.value;
    state.overwrite = true;
    state.expression = entry.expression;
    render();
  }

  /* ---------- Wiring ---------- */

  function handleButton(button) {
    const { digit, operator, action } = button.dataset;

    if (digit !== undefined) {
      inputDigit(digit);
      return;
    }
    if (operator !== undefined) {
      inputOperator(operator);
      return;
    }

    switch (action) {
      case 'decimal':
        inputDecimal();
        break;
      case 'equals':
        inputEquals();
        break;
      case 'clear':
        clearAll();
        break;
      case 'sign':
        toggleSign();
        break;
      case 'percent':
        inputPercent();
        break;
      case 'backspace':
        backspace();
        break;
    }
  }

  keysEl.addEventListener('click', (event) => {
    const button = event.target.closest('button.key');
    if (button) handleButton(button);
  });

  function flash(selector) {
    const button = keysEl.querySelector(selector);
    if (!button) return;
    button.classList.add('is-pressed');
    setTimeout(() => button.classList.remove('is-pressed'), 110);
  }

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const { key } = event;
    const active = document.activeElement;

    // Let the browser activate a focused button natively (avoids double input).
    if (active && active.tagName === 'BUTTON' && (key === 'Enter' || key === ' ')) return;

    let selector = null;
    let action = null;

    if (/^[0-9]$/.test(key)) {
      selector = `[data-digit="${key}"]`;
      action = () => inputDigit(key);
    } else if (key === '.') {
      selector = '[data-action="decimal"]';
      action = inputDecimal;
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
      selector = `[data-operator="${key}"]`;
      action = () => inputOperator(key);
    } else if (key === 'Enter' || key === '=') {
      selector = '[data-action="equals"]';
      action = inputEquals;
    } else if (key === 'Escape' || key === 'Delete' || key.toLowerCase() === 'c') {
      selector = '[data-action="clear"]';
      action = clearAll;
    } else if (key === '%') {
      selector = '[data-action="percent"]';
      action = inputPercent;
    } else if (key === 'Backspace') {
      action = backspace;
    }

    if (!action) return;

    event.preventDefault();
    action();
    if (selector) flash(selector);
  });

  clearHistoryBtn.addEventListener('click', () => {
    history = [];
    persistHistory();
    renderHistory();
  });

  render();
  renderHistory();
})();
