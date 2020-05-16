'use strict';

const { getUserMedia } = require('@twilio/webrtc');

const MediaTrackTransceiver = require('./transceiver');

/**
 * A {@link MediaTrackSender} represents one or more local RTCRtpSenders.
 * @extends MediaTrackTransceiver
 */
class MediaTrackSender extends MediaTrackTransceiver {
  /**
   * Construct a {@link MediaTrackSender}.
   * @param {MediaStreamTrack} mediaStreamTrack
   */
  constructor(mediaStreamTrack) {
    super(mediaStreamTrack.id, mediaStreamTrack);
    Object.defineProperties(this, {
      _clones: {
        value: new Set()
      },
      _senders: {
        value: new Set()
      }
    });
  }

  /**
   * Return a new {@link MediaTrackSender} containing a clone of the underlying
   * MediaStreamTrack. No RTCRtpSenders are copied.
   * @returns {MediaTrackSender}
   */
  clone() {
    const trackSenderClone = new MediaTrackSender(this.track.clone());
    this._clones.add(trackSenderClone);
    return trackSenderClone;
  }

  /**
   * Add an RTCRtpSender.
   * @param {RTCRtpSender} sender
   * @returns {this}
   */
  addSender(sender) {
    this._senders.add(sender);
    return this;
  }

  /**
   * Remove the given {@link MediaTrackSender} clone.
   * @param {MediaTrackSender} clone
   * @returns {this}
   */
  removeClone(clone) {
    this._clones.delete(clone);
    return this;
  }

  /**
   * Remove an RTCRtpSender.
   * @param {RTCRtpSender} sender
   * @returns {this}
   */
  removeSender(sender) {
    this._senders.delete(sender);
    return this;
  }

  /**
   * Apply the given MediaTrackConstraints.
   * @param {MediaTrackConstraints} constraints
   * @returns {Promise<void>}
   */
  setInputOptions(constraints) {
    return getUserMedia({ [this.kind]: constraints }).then(mediaStream => {
      const mediaStreamTrack = mediaStream.getTracks()[0];
      return this.setMediaStreamTrack(mediaStreamTrack);
    });
  }

  /**
   * Set the given MediaStreamTrack.
   * @param {MediaStreamTrack} mediaStreamTrack
   * @returns {Promise<void>}
   */
  setMediaStreamTrack(mediaStreamTrack) {
    const clones = Array.from(this._clones);
    const senders = Array.from(this._senders);
    return Promise.all(clones.map(trackSender => {
      return trackSender.setMediaStreamTrack(mediaStreamTrack.clone());
    }).concat(senders.map(sender => {
      return sender.replaceTrack(mediaStreamTrack);
    }))).then(() => {
      this._track.stop();
      this._track = mediaStreamTrack;
    });
  }
}

module.exports = MediaTrackSender;
