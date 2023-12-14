class TimecodeInput extends HTMLInputElement {
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

  /**
   * Get a textual value from a numerical one.
   *
   * @param {number} value The numercial value
   * @return {string} The textual value
   */
  static formatValue(value) {
    let formatted_value = "";

    this.SEGMENTS.forEach(({ prefix, multiplier, max }) => {
      formatted_value += prefix;

      if (value == null) {
        formatted_value += `${this.PLACEHOLDER}${this.PLACEHOLDER}`;
      } else {
        let sub_value = parseInt((value / multiplier) % (max + 1)) || 0;
        sub_value = ("" + sub_value).padStart(2, "0");

        formatted_value += sub_value;
      }
    });

    return formatted_value;
  }

  static get observedAttributes() {
    return ["value", "min", "max"];
  }

  constructor() {
    super();

    this._onFocus = this._onFocus.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onMousedown = this._onMousedown.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
    this._onPaste = this._onPaste.bind(this);

    const regexp_str = this.constructor.SEGMENTS.map((s) => {
      return `${s.prefix}(${s.regex})`;
    }).join("");
    this._regexp = new RegExp(`^${regexp_str}$`);

    this._options = {
      min: 0,
      max: null,
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

    this._setValue(super.value * this.constructor.PRECISION_FACTOR, false);
  }

  get value() {
    return this._state.value != null ? this._state.value / this.constructor.PRECISION_FACTOR : null;
  }

  set value(value) {
    const numeric_value = parseFloat(value);
    this._setValue(!isNaN(numeric_value) ? numeric_value * this.constructor.PRECISION_FACTOR : null);
  }

  get formattedValue() {
    return super.value;
  }

  _onFocus() {
    this._state.keys_pressed = 0;
    if (!this._state.skip_focus) {
      this._setFocusedSegment(0);
    }
  }

  _onBlur() {
    this._commitValue();
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
    if (this._state.focused_segment != null) {
      if (evt.deltaY < 0) {
        this._incrementSegmentValue(this._state.focused_segment);
      } else if (evt.deltaY > 0) {
        this._decrementSegmentValue(this._state.focused_segment);
      }
    }
  }

  _onKeydown(evt) {
    const { key, shiftKey, altKey } = evt;

    // Skip if Alt key is pressed.
    if (altKey) return;

    switch (key) {
      case "ArrowLeft":
      case "ArrowRight":
        {
          const index =
            this._state.focused_segment + (key === "ArrowLeft" ? -1 : 1);

          if (index >= 0 && index < this.constructor.SEGMENTS.length) {
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

          if (index >= 0 && index < this.constructor.SEGMENTS.length) {
            this._setFocusedSegment(index);
            evt.preventDefault();
          }
        }
        break;
      case "Enter":
        this._commitValue();
        break;

      default:
        if (this._isNumeric(key)) {
          // Numeric key.
          if (this._state.focused_segment < this.constructor.SEGMENTS.length) {
            let segment_value = parseInt(
              this._getSegmentValue(this._state.focused_segment),
              10
            );

            if (this._state.keys_pressed === 0 || isNaN(segment_value)) {
              segment_value = 0;
            }

            segment_value += key;

            segment_value = Math.min(
              this.constructor.SEGMENTS[this._state.focused_segment].max,
              segment_value
            );

            this._setSegmentValue(this._state.focused_segment, segment_value);
          }
        }
    }

    evt.preventDefault();
  }

  _onPaste(evt) {
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

      this.setSelectionRange(0, 0);
      this.setSelectionRange(start, end);
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

    if (typeof this.selectionStart === "number") {
      caretPosition =
        this.selectionDirection === "backward"
          ? this.selectionStart
          : this.selectionEnd;
    }

    return caretPosition;
  }

  /**
   * Helper function to retreive the value of a segmnet
   * @param {number} index The segment's index
   * @return {string} The segment's value
   */
  _getSegmentValue(index) {
    const matches = super.value.match(this._regexp);

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
    this._setValue(this._state.value + (diff * this.constructor.SEGMENTS[index].multiplier), false);

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
    this._setValue(this._state.value + this.constructor.SEGMENTS[index].multiplier, false);
    this._updateSelection();
    this.dispatchEvent(new Event("input"));
  }

  /**
   * Helper function to decrement a segment's value
   * @param {number} index The segment's index
   */
  _decrementSegmentValue(index) {
    this._setValue(this._state.value - this.constructor.SEGMENTS[index].multiplier, false);
    this._updateSelection();
    this.dispatchEvent(new Event("input"));
  }

  /**
   * Helper function to convert a textual value to a numerical one
   * @param {string} formatted_value The textual value
   * @return {number} The numercial value
   */
  _getValue(formatted_value) {
    if (formatted_value.indexOf(this.constructor.PLACEHOLDER) !== -1) {
      return null;
    }

    let value = 0;
    const matches = formatted_value.match(this._regexp);

    if (matches) {
      matches.shift();

      matches.forEach((match, i) => {
        value +=
          parseInt(match, 10) * this.constructor.SEGMENTS[i].multiplier;
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
    else {
      if (this._options.min != null) {
        this._state.value = Math.max(this._state.value, this._options.min);
      }

      if (this._options.max != null) {
        this._state.value = Math.min(this._state.value, this._options.max);
      }
    }

    if (emitChange && oldValue !== this._state.value) {
      this.dispatchEvent(new Event("change"));
    }

    super.value = this.constructor.formatValue(this._state.value);
  }

  _setFormattedValue(value) {
    super.value = value;
  }

  _commitValue() {
    this._state.keys_pressed = 0;
    this._setFocusedSegment(null);
    this.dispatchEvent(new Event("change"));
  }

  connectedCallback() {
    this.addEventListener("focus", this._onFocus);
    this.addEventListener("blur", this._onBlur);
    this.addEventListener("mousedown", this._onMousedown);
    this.addEventListener("click", this._onClick);
    this.addEventListener("wheel", this._onWheel);
    this.addEventListener("keydown", this._onKeydown);
    this.addEventListener("paste", this._onPaste);
  }

  disconnectedCallback() {
    this.removeEventListener("focus", this._onFocus);
    this.removeEventListener("blur", this._onBlur);
    this.removeEventListener("mousedown", this._onMousedown);
    this.removeEventListener("click", this._onClick);
    this.removeEventListener("wheel", this._onWheel);
    this.removeEventListener("keydown", this._onKeydown);
    this.removeEventListener("paste", this._onPaste);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "value":
        this.value = newValue;
        break;

      case "min":
      case "max":
        {
          const limit = parseFloat(newValue);
          this._options[name] = !isNaN(limit) ? parseInt(limit * this.constructor.PRECISION_FACTOR, 10) : null;
          if (this._state.value != null) this._setValue(this._state.value);
        }
        break;
    }
  }
}

export default TimecodeInput;

if (!window.customElements.get("timecode-input")) {
  window.customElements.define("timecode-input", TimecodeInput, {
    extends: "input",
  });
}
