'use strict';

const LocalTrackStats = require('./localtrackstats');

/**
 * Statistics for a {@link LocalAudioTrack}.
 * @extends LocalTrackStats
 * @property {?AudioLevel} audioLevel - Input {@link AudioLevel}
 */
class LocalAudioTrackStats extends LocalTrackStats {
  /**
   * @param {string} trackId - {@link LocalAudioTrack} ID
   * @param {StandardizedTrackStatsReport} statsReport
   * @param {boolean} prepareForInsights
   * @param {number} networkQuality
   */
  constructor(trackId, statsReport, prepareForInsights, networkQuality) {
    super(trackId, statsReport, prepareForInsights, networkQuality);

    Object.defineProperties(this, {
      audioLevel: {
        value: typeof statsReport.audioInputLevel === 'number'
          ? statsReport.audioInputLevel
          : null,
        enumerable: true
      }
    });
  }
}

/**
 * The maximum absolute amplitude of a set of audio samples in the
 * range of 0 to 32767 inclusive.
 * @typedef {number} AudioLevel
 */

module.exports = LocalAudioTrackStats;
