const stylesheet = new CSSStyleSheet()
stylesheet.replaceSync(`
  :host {
    display: inline-block;
  }

  input {
    text-align: center;
  }
`);

export default class TimecodeInput extends HTMLElement {
  static formAssociated = true;

  static PLACEHOLDER = "–";

  static PRECISION_FACTOR = 1000;

  static SEGMENTS = [
    {
      name: "hours",
      multiplier: 3600 * this.PRECISION_FACTOR,
      max: 99,
      prefix: "",
      regex: `[${this.PLACEHOLDER}0-9]{1,2}`,
    },
    {
      name: "minutes",
      multiplier: 60 * this.PRECISION_FACTOR,
      max: 59,
      prefix: ":",
      regex: `[${this.PLACEHOLDER}0-5]?[${this.PLACEHOLDER}0-9]`,
    },
    {
      name: "seconds",
      multiplier: 1 * this.PRECISION_FACTOR,
      max: 59,
      prefix: ":",
      regex: `[${this.PLACEHOLDER}0-5]?[${this.PLACEHOLDER}0-9]`,
    },
    {
      name: "centiseconds",
      multiplier: 0.01 * this.PRECISION_FACTOR,
      max: 99,
      prefix: ".",
      regex: `[${this.PLACEHOLDER}0-9]{1,2}`,
    },
  ];

  static observedAttributes = ["value", "min", "max", "readonly", "disabled", "required"];

  /**
   * Get a textual value from a numerical one.
   *
   * @param {number} value The numercial value
   * @param {boolean} _internal Whether the value is internal, i.e. multiplied by the precision factor
   * @return {string} The textual value
   */
  static formatValue(value, _internal = false) {
    let formatted_value = "";

    this.SEGMENTS.forEach(({ prefix, multiplier, max }) => {
      formatted_value += prefix;

      if (value == null) {
        formatted_value += `${this.PLACEHOLDER}${this.PLACEHOLDER}`;
      } else {
        let sub_value = _internal ? value : value * this.PRECISION_FACTOR;
        sub_value = parseInt((sub_value / multiplier) % (max + 1)) || 0;
        sub_value = ("" + sub_value).padStart(2, "0");

        formatted_value += sub_value;
      }
    });

    return formatted_value;
  }

  constructor() {
    super();

    this.attachShadow({mode: 'open'});
    this.shadowRoot.adoptedStyleSheets = [stylesheet];

    this._internals = this.attachInternals();
    this._internals.ariaRole = 'input';

    this._onFocus = this._onFocus.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onMousedown = this._onMousedown.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onPaste = this._onPaste.bind(this);

    this._input = document.createElement('input');
    this._input.setAttribute('type', 'text');
    this._input.setAttribute('part', 'input');

    this.shadowRoot.appendChild(this._input);

    const regexp_str = TimecodeInput.SEGMENTS.map((s) => {
      return `${s.prefix}(${s.regex})`;
    }).join("");
    this._regexp = new RegExp(`^${regexp_str}$`);

    this._options = {
      min: 0,
      max: null,
      required: false,
    };

    this._state = {
      /**
       * The current numerical value
       * @type {number|null}
       */
      value: null,

      /**
       * The count of keys pressed
       * @type {number}
       */
      keys_pressed: 0,

      /**
       * The index of the currenty focused segment
       * @type {number|null}
       */
      focused_segment: null,

      /**
       * Whether to skip setting the focused segment on focus
       * @type {boolean}
       */
      skip_focus: false,

      /**
       * Whether an input occured but the current value has not yet been updated
       * @type {boolean}
       */
      dirty: false,
    };

    this._setValue(this._input.value * TimecodeInput.PRECISION_FACTOR, false);
  }

  get value() {
    return this._state.value != null ? this._state.value / TimecodeInput.PRECISION_FACTOR : null;
  }

  set value(value) {
    const numeric_value = parseFloat(value);
    this._setValue(!isNaN(numeric_value) ? numeric_value * TimecodeInput.PRECISION_FACTOR : null);
  }

  get min(){
    return this._options.min;
  }

  set min(value){
    const limit = parseFloat(value);
    this._options.min = !isNaN(limit) ? parseInt(limit * TimecodeInput.PRECISION_FACTOR, 10) : null;
    this._updateValidity();
  }

  get max(){
    return this._options.max;
  }

  set max(value){
    const limit = parseFloat(value);
    this._options.max = !isNaN(limit) ? parseInt(limit * TimecodeInput.PRECISION_FACTOR, 10) : null;
    this._updateValidity();
  }

  get required(){
    return this._options.required;
  }

  set required(value){
    this._options.required = value;
    this._updateValidity();
  }

  get readOnly(){
    return this._input.readOnly;
  }

  set readOnly(value){
    this._input.readOnly = value;
  }

  get disabled(){
    return this._input.disabled;
  }

  set disabled(value){
    this._input.disabled = value;
  }

  get formattedValue() {
    return this._input.value;
  }

  _onFocus() {
    this._state.keys_pressed = 0;
    if (!this._state.skip_focus) {
      this._setFocusedSegment(0);
    }
  }

  _onBlur() {
    this._state.keys_pressed = 0;
    this._setFocusedSegment(null);
    this.dispatchEvent(new Event("change"));
  }

  _onMousedown() {
    this._state.skip_focus = true;
  }

  _onClick() {
    const caret_position = this._getCaretPosition();
    this._setFocusedSegment(Math.floor(caret_position / 3));
    this._state.skip_focus = false;
  }

  _onWheel(evt) {
    if (this.readOnly) return;

    if (this._state.focused_segment != null) {
      if (evt.deltaY < 0) {
        this._incrementSegmentValue(this._state.focused_segment);
      } else if (evt.deltaY > 0) {
        this._decrementSegmentValue(this._state.focused_segment);
      }
    }
  }

  _onKeydown(evt) {
    if (this.readOnly) return;

    const { key, shiftKey, altKey } = evt;

    // Skip if Alt key is pressed.
    if (altKey) return;

    switch (key) {
      case "ArrowLeft":
      case "ArrowRight":
        {
          const index =
            this._state.focused_segment + (key === "ArrowLeft" ? -1 : 1);

          if (index >= 0 && index < TimecodeInput.SEGMENTS.length) {
            this._setFocusedSegment(index);
          }

          evt.preventDefault();
        }
        break;
      case "ArrowUp":
        {
          if (this._state.focused_segment != null) {
            this._incrementSegmentValue(this._state.focused_segment);
          }

          evt.preventDefault();
        }
        break;
      case "ArrowDown":
        {
          if (this._state.focused_segment != null) {
            this._decrementSegmentValue(this._state.focused_segment);
          }

          evt.preventDefault();
        }
        break;
      case "Tab":
        {
          const index = this._state.focused_segment + (shiftKey ? -1 : 1);

          if (index >= 0 && index < TimecodeInput.SEGMENTS.length) {
            this._setFocusedSegment(index);
            evt.preventDefault();
          }
        }
        break;
      case "Enter":
        this._state.keys_pressed = 0;
        this.dispatchEvent(new Event("change"));
        break;

      default:
        if (this._isNumeric(key)) {
          // Numeric key.
          if (this._state.focused_segment < TimecodeInput.SEGMENTS.length) {
            let segment_value = parseInt(
              this._getSegmentValue(this._state.focused_segment),
              10
            );

            if (this._state.keys_pressed === 0 || isNaN(segment_value)) {
              segment_value = 0;
            }

            segment_value += key;

            segment_value = Math.min(
              TimecodeInput.SEGMENTS[this._state.focused_segment].max,
              segment_value
            );

            this._setSegmentValue(this._state.focused_segment, segment_value);
          }
        }
    }

    evt.preventDefault();
  }

  _onPaste(evt) {
    if (this.readOnly) return;

    const clipboard_data = evt.clipboardData || window.clipboardData;
    const pasted_data = clipboard_data.getData("Text");

    if (this._isFormattedValueValid(pasted_data)) {
      this._setValue(this._getValue(pasted_data), false);
      this.dispatchEvent(new Event("input"));
    }

    evt.preventDefault();
  }

  /**
   * Helper function to check if a certain value represents a numeric value
   * @param {mixed} value The value to check
   * @return {boolean} True if the value represents a numeric value, false otherwise
   */
  _isNumeric(value) {
    return (
      (typeof value === "number" ||
        (typeof value === "string" && value.trim() !== "")) &&
      !isNaN(value)
    );
  }

  /**
   * Helper function to check if a certain value is a valid textual value
   * @param {string} value The value to check
   * @return {boolean} True if the value is a valid textual value, false otherwise
   */
  _isFormattedValueValid(value) {
    return this._regexp.test(value);
  }

  _updateSelection() {
    if (this._state.focused_segment != null) {
      const start = this._state.focused_segment * 3;
      const end = start + 2;

      this._input.setSelectionRange(0, 0);
      this._input.setSelectionRange(start, end);
    }
  }

  _setFocusedSegment(index) {
    this._state.focused_segment = index;
    this._updateSelection();
  }

  /**
   * Helper function to retreive the input's current caret position
   * @return {number} The caret position
   */
  _getCaretPosition() {
    let caretPosition = 0;

    if (typeof this._input.selectionStart === "number") {
      caretPosition =
      this._input.selectionDirection === "backward"
          ? this._input.selectionStart
          : this._input.selectionEnd;
    }

    return caretPosition;
  }

  /**
   * Helper function to retreive the value of a segmnet
   * @param {number} index The segment's index
   * @return {string} The segment's value
   */
  _getSegmentValue(index) {
    const matches = this._input.value.match(this._regexp);

    if (matches) {
      matches.shift();
      return matches[index];
    }

    return null;
  }

  /**
   * Helper function to set the value of a segmnet
   * @param {number} index The segment's index
   * @param {number} value The segment's value
   */
  _setSegmentValue(index, value) {
    let old_segment_value = parseInt(this._getSegmentValue(index), 10);
    if (isNaN(old_segment_value)) {
      old_segment_value = 0;
    }

    let new_segment_value = parseInt(value, 10);
    if (isNaN(new_segment_value)) {
      new_segment_value = 0;
    }

    const diff = new_segment_value - old_segment_value;
    this._setValue(this._state.value + (diff * TimecodeInput.SEGMENTS[index].multiplier), false);

    if (++this._state.keys_pressed === 2) {
      this._state.keys_pressed = 0;
      this._state.focused_segment++;
    }

    this._updateSelection();
    this.dispatchEvent(new Event("input"));
  }

  /**
   * Helper function to increment a segment's value
   * @param {number} index The segment's index
   */
  _incrementSegmentValue(index) {
    let value = this._state.value + TimecodeInput.SEGMENTS[index].multiplier;

    if (this.max != null) value = Math.min(value, this.max);

    this._setValue(value, false);

    this._updateSelection();
    this.dispatchEvent(new Event("input"));
  }

  /**
   * Helper function to decrement a segment's value
   * @param {number} index The segment's index
   */
  _decrementSegmentValue(index) {
    let value = this._state.value - TimecodeInput.SEGMENTS[index].multiplier;

    if (this.min != null) value = Math.max(value, this.min);

    this._setValue(value, false);

    this._updateSelection();
    this.dispatchEvent(new Event("input"));
  }

  /**
   * Helper function to convert a textual value to a numerical one
   * @param {string} formatted_value The textual value
   * @return {number} The numercial value
   */
  _getValue(formatted_value) {
    if (formatted_value.indexOf(TimecodeInput.PLACEHOLDER) !== -1) {
      return null;
    }

    let value = 0;
    const matches = formatted_value.match(this._regexp);

    if (matches) {
      matches.shift();

      matches.forEach((match, i) => {
        value +=
          parseInt(match, 10) * TimecodeInput.SEGMENTS[i].multiplier;
      });
    }

    return value;
  }

  _setValue(value, emitChange = true) {
    const oldValue = this._state.value;

    this._state.value = parseFloat(value);

    if (isNaN(this._state.value)) {
      this._state.value = null;
    }

    if (emitChange && oldValue !== this._state.value) {
      this.dispatchEvent(new Event("change"));
    }

    this._input.value = TimecodeInput.formatValue(this._state.value, true);

    this._internals.setFormValue(this._state.value);

    this._updateValidity();
  }

  _setFormattedValue(value) {
    this._input.value = value;
  }

  _updateValidity() {
    if (this._state.value == null) {
      if (this.required) {
        this._internals.setValidity({ valueMissing: true }, 'Please enter a value', this._input);
      } else {
        this._internals.setValidity({});
      }
      return;
    }

    if (this.min != null && this._state.value < this.min) {
      const min = TimecodeInput.formatValue(this.min);
      this._internals.setValidity({ rangeUnderflow: true }, `Please select a value that is greater than ${min}`, this._input);
      return;
    }

    if (this.max != null && this._state.value > this.max) {
      const max = TimecodeInput.formatValue(this.max);
      this._internals.setValidity({ rangeOverflow : true }, `Please select a value that is less than ${max}`, this._input);
      return;
    }

    this._internals.setValidity({});
  }

  connectedCallback() {
    this._input.addEventListener("focus", this._onFocus);
    this._input.addEventListener("blur", this._onBlur);
    this._input.addEventListener("mousedown", this._onMousedown);
    this._input.addEventListener("click", this._onClick);
    this._input.addEventListener("wheel", this._onWheel);
    this._input.addEventListener("keydown", this._onKeydown);
    this._input.addEventListener("paste", this._onPaste);
  }

  disconnectedCallback() {
    this._input.removeEventListener("focus", this._onFocus);
    this._input.removeEventListener("blur", this._onBlur);
    this._input.removeEventListener("mousedown", this._onMousedown);
    this._input.removeEventListener("click", this._onClick);
    this._input.removeEventListener("wheel", this._onWheel);
    this._input.removeEventListener("keydown", this._onKeydown);
    this._input.removeEventListener("paste", this._onPaste);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "value":
      case "min":
      case "max":
        this[name] = newValue;
        break;

      default:
        this[name] = newValue == null ? null : true;
        break;
    }
  }
}

if (!window.customElements.get("timecode-input")) {
  window.customElements.define("timecode-input", TimecodeInput);
}
