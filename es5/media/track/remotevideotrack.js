'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _require = require('../../util'),
    oncePerDuration = _require.oncePerDuration;

var mixinRemoteMediaTrack = require('./remotemediatrack');
var VideoTrack = require('./videotrack');

var RENDER_HINT_DURATION_MS = 200;
var RemoteMediaVideoTrack = mixinRemoteMediaTrack(VideoTrack);

/**
 * A {@link RemoteVideoTrack} represents a {@link VideoTrack} published to a
 * {@link Room} by a {@link RemoteParticipant}.
 * @extends VideoTrack
 * @property {boolean} isEnabled - Whether the {@link RemoteVideoTrack} is enabled
 * @property {boolean} isSwitchedOff - Whether the {@link RemoteVideoTrack} is switched off
 * @property {Track.SID} sid - The {@link RemoteVideoTrack}'s SID
 * @property {?Track.Priority} priority - The subscribe priority of the {@link RemoteVideoTrack}
 * @emits RemoteVideoTrack#dimensionsChanged
 * @emits RemoteVideoTrack#disabled
 * @emits RemoteVideoTrack#enabled
 * @emits RemoteVideoTrack#started
 * @emits RemoteVideoTrack#switchedOff
 * @emits RemoteVideoTrack#switchedOn
 */

var RemoteVideoTrack = function (_RemoteMediaVideoTrac) {
  _inherits(RemoteVideoTrack, _RemoteMediaVideoTrac);

  /**
   * Construct a {@link RemoteVideoTrack}.
   * @param {Track.SID} sid - The {@link RemoteVideoTrack}'s SID
   * @param {MediaTrackReceiver} mediaTrackReceiver - A video MediaStreamTrack container
   * @param {boolean} isEnabled - whether the {@link RemoteVideoTrack} is enabled
   * @param {function(?Track.Priority): void} setPriority - Set or clear the subscribe
   *  {@link Track.Priority} of the {@link RemoteVideoTrack}
   * @param {{log: Log}} options - The {@link RemoteTrack} options
   */
  function RemoteVideoTrack(sid, mediaTrackReceiver, isEnabled, setPriority, options) {
    _classCallCheck(this, RemoteVideoTrack);

    var _this = _possibleConstructorReturn(this, (RemoteVideoTrack.__proto__ || Object.getPrototypeOf(RemoteVideoTrack)).call(this, sid, mediaTrackReceiver, isEnabled, setPriority, options));

    Object.defineProperties(_this, {
      _intersectionObserver: {
        value: new IntersectionObserver(function (entries) {
          var shouldSetRenderHint = false;
          entries.forEach(function (entry) {
            if (entry.target.isIntersecting !== entry.isIntersecting) {
              entry.target.isIntersecting = entry.isIntersecting;
              shouldSetRenderHint = true;
            }
          });
          if (shouldSetRenderHint) {
            _this._setRenderHint();
          }
        }, { threshold: 0.25 })
      },
      _renderHint: {
        get: function get() {
          var visibleEls = this._getAllAttachedElements().filter(function (el) {
            return el.isIntersecting;
          });
          var isVisible = this.isEnabled && !this._isSwitchedOff && visibleEls.length > 0;
          if (!isVisible) {
            return { height: 0, width: 0 };
          }

          var _visibleEls$sort = visibleEls.sort(function (el1, el2) {
            return el2.clientHeight + el2.clientWidth - el1.clientHeight - el1.clientWidth - 1;
          }),
              _visibleEls$sort2 = _slicedToArray(_visibleEls$sort, 1),
              _visibleEls$sort2$ = _visibleEls$sort2[0],
              clientHeight = _visibleEls$sort2$.clientHeight,
              clientWidth = _visibleEls$sort2$.clientWidth;

          return { height: clientHeight, width: clientWidth };
        }
      },
      _resizeObserver: {
        value: new ResizeObserver(function () {
          return _this._setRenderHint();
        })
      },
      _setRenderHint: {
        value: oncePerDuration(function () {
          _this._setPriority(_this._priority, _this._renderHint);
        }, RENDER_HINT_DURATION_MS)
      }
    });

    _this._setRenderHint();
    return _this;
  }

  _createClass(RemoteVideoTrack, [{
    key: 'toString',
    value: function toString() {
      return '[RemoteVideoTrack #' + this._instanceId + ': ' + this.sid + ']';
    }
  }, {
    key: 'attach',
    value: function attach() {
      var el = _get(RemoteVideoTrack.prototype.__proto__ || Object.getPrototypeOf(RemoteVideoTrack.prototype), 'attach', this).apply(this, arguments);
      this._intersectionObserver.observe(el);
      this._resizeObserver.observe(el);
      return el;
    }
  }, {
    key: 'detach',
    value: function detach() {
      var _this2 = this;

      var els = _get(RemoteVideoTrack.prototype.__proto__ || Object.getPrototypeOf(RemoteVideoTrack.prototype), 'detach', this).apply(this, arguments);
      (Array.isArray(els) ? els : [els]).forEach(function (el) {
        _this2._intersectionObserver.unobserve(el);
        _this2._resizeObserver.unobserve(el);
      });
      this._setRenderHint();
      return els;
    }

    /**
     * Update the subscribe {@link Track.Priority} of the {@link RemoteVideoTrack}.
     * @param {?Track.Priority} priority - the new subscribe {@link Track.Priority};
     *   If <code>null</code>, then the subscribe {@link Track.Priority} is cleared, which
     *   means the {@link Track.Priority} set by the publisher is now the effective priority.
     * @returns {this}
     * @throws {RangeError}
     */

  }, {
    key: 'setPriority',
    value: function setPriority(priority) {
      return _get(RemoteVideoTrack.prototype.__proto__ || Object.getPrototypeOf(RemoteVideoTrack.prototype), 'setPriority', this).call(this, priority);
    }
  }]);

  return RemoteVideoTrack;
}(RemoteMediaVideoTrack);

/**
 * The {@link RemoteVideoTrack}'s dimensions changed.
 * @param {RemoteVideoTrack} track - The {@link RemoteVideoTrack} whose
 *   dimensions changed
 * @event RemoteVideoTrack#dimensionsChanged
 */

/**
 * The {@link RemoteVideoTrack} was disabled, i.e. "paused".
 * @param {RemoteVideoTrack} track - The {@link RemoteVideoTrack} that was
 *   disabled
 * @event RemoteVideoTrack#disabled
 */

/**
 * The {@link RemoteVideoTrack} was enabled, i.e. "resumed".
 * @param {RemoteVideoTrack} track - The {@link RemoteVideoTrack} that was
 *   enabled
 * @event RemoteVideoTrack#enabled
 */

/**
 * The {@link RemoteVideoTrack} started. This means there is enough video data
 * to begin playback.
 * @param {RemoteVideoTrack} track - The {@link RemoteVideoTrack} that started
 * @event RemoteVideoTrack#started
 */

/**
 * A {@link RemoteVideoTrack} was switched off.
 * @param {RemoteVideoTrack} track - The {@link RemoteVideoTrack} that was
 *   switched off
 * @event RemoteVideoTrack#switchedOff
 */

/**
 * A {@link RemoteVideoTrack} was switched on.
 * @param {RemoteVideoTrack} track - The {@link RemoteVideoTrack} that was
 *   switched on
 * @event RemoteVideoTrack#switchedOn
 */

module.exports = RemoteVideoTrack;