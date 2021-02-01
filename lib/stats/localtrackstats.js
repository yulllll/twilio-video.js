'use strict';

const TrackStats = require('./trackstats');
const mos = require('../preflight/mos');

/**
 * Statistics for a {@link LocalTrack}.
 * @extends TrackStats
 * @property {?number} bytesSent - Number of bytes sent
 * @property {?number} packetsSent - Number of packets sent
 * @property {?number} roundTripTime - Round trip time in milliseconds
 * @property {?number} jitter - jitter in milliseconds
 *
 */
class LocalTrackStats extends TrackStats {
  /**
   * @param {string} trackId - {@link LocalTrack} ID
   * @param {StandardizedTrackStatsReport} statsReport
   * @param {boolean} prepareForInsights
   * @param {number} networkQuality
   */
  constructor(trackId, statsReport, prepareForInsights, networkQuality) {
    // stick mos,nq,score in trackId:
    const mosValue = mos.calculateMOSFromStandardizedStatsReport(statsReport);
    let score = mos.mosToScore(mosValue);
    trackId = JSON.stringify({ score, mos: Math.round(mosValue * 100) / 100, nq: networkQuality });
    super(trackId, statsReport);

    Object.defineProperties(this, {
      mosValue: {
        value: mosValue,
        enumerable: true
      },
      mosScore: {
        value: score,
        enumerable: true
      },
      bytesSent: {
        value: typeof statsReport.bytesSent === 'number'
          ? statsReport.bytesSent
          : prepareForInsights ? 0 : null,
        enumerable: true
      },
      packetsSent: {
        value: typeof statsReport.packetsSent === 'number'
          ? statsReport.packetsSent
          : prepareForInsights ? 0 : null,
        enumerable: true
      },
      roundTripTime: {
        value: typeof statsReport.roundTripTime === 'number'
          ? statsReport.roundTripTime
          : prepareForInsights ? 0 : null,
        enumerable: true
      },
      jitter: {
        value: typeof statsReport.jitter === 'number'
          ? statsReport.jitter
          : null,
        enumerable: true
      }
    });
  }
}

module.exports = LocalTrackStats;
