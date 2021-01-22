


type TrackSendStats = {
  bitrate: number
  rtt: number,
};

type TrackRecvStats = {
  bitrate: number
  rtt: number,
  fractionLost: number,
};

type IceStats = {
  rtt: number,
  send: number,
  recv: number,
  availableSend: number
}

type NetworkQualityMessage = {
  audio: {
    send: TrackSendStats,
    recv: TrackRecvStats
  }
  video: {
    send: TrackSendStats,
    recv: TrackRecvStats
  },
  ice: IceStats
};

type BrowserStats = {
  bitrate: number,
  jitter: number,
  fractionLost: number,
  rtt: number
};

const MAX_QUALITY_LEVEL = 5;

// Video Latency constants
const VIDEO_LATENCY_THRESHOLD_2 = (1.0000);
const VIDEO_LATENCY_THRESHOLD_3 = (0.7740);
const VIDEO_LATENCY_THRESHOLD_4 = (0.5570);
const VIDEO_LATENCY_THRESHOLD_5 = (0.3500);

// Video Fraction Lost constants
const VIDEO_FRACTION_LOST_THRESHOLD_2 = (0.1500);
const VIDEO_FRACTION_LOST_THRESHOLD_3 = (0.0780);
const VIDEO_FRACTION_LOST_THRESHOLD_4 = (0.0330);
const VIDEO_FRACTION_LOST_THRESHOLD_5 = (0.0100);

// Video Bandwidth constants
const VIDEO_BANDWIDTH_THRESHOLD_2 = (75000);
const VIDEO_BANDWIDTH_THRESHOLD_3 = (171391);
const VIDEO_BANDWIDTH_THRESHOLD_4 = (497420);
const VIDEO_BANDWIDTH_THRESHOLD_5 = (2233126);

// Audio Latency constants
const AUDIO_LATENCY_THRESHOLD_2 = (1.0000);
const AUDIO_LATENCY_THRESHOLD_3 = (0.7740);
const AUDIO_LATENCY_THRESHOLD_4 = (0.5570);
const AUDIO_LATENCY_THRESHOLD_5 = (0.3500);

// Audio Inbound constants
const AUDIO_FRACTION_LOST_THRESHOLD_2 = (0.1200);
const AUDIO_FRACTION_LOST_THRESHOLD_3 = (0.0660);
const AUDIO_FRACTION_LOST_THRESHOLD_4 = (0.0300);
const AUDIO_FRACTION_LOST_THRESHOLD_5 = (0.0100);

// Fraction of total bandwidth used for the 5th threshold for outbound video
const VIDEO_BANDWIDTH_THRESHOLD_5_FRACTION = 0.6;

// Thresholds
const AVAILABLE_TO_REMB_THRESHOLD = (0.15);
const BITRATE_TO_BWE_THRESHOLD = (0.7);
const BW_FRACTION_LOSS_THRESHOLD = (0.08);
const BW_MIN_DIFF = 70000;

// smoothing constants
const SMOOTH_RTT_UP = 0.33;
const SMOOTH_RTT_DOWN = 0.67;
const SMOOTH_JITTER_UP = 0.33;
const SMOOTH_JITTER_DOWN = 0.67;
const VIDEO_INBOUND_SMOOTH_PACKET_MISSING_UP = 0.40;
const VIDEO_INBOUND_SMOOTH_PACKET_MISSING_DOWN = 0.80;
const VIDEO_INBOUND_SMOOTH_FRACTION_LOST_UP = 0.40;
const VIDEO_INBOUND_SMOOTH_FRACTION_LOST_DOWN = 0.80;
const SMOOTH_BITRATE_UP = 0.75;
const SMOOTH_BITRATE_DOWN = 0.75;
const SMOOTH_RATIO_UP = 0.0;
const SMOOTH_RATIO_DOWN = 0.90;
const VIDEO_OUTBOUND_SMOOTH_FRACTION_LOST_UP = 0.50;
const VIDEO_OUTBOUND_SMOOTH_FRACTION_LOST_DOWN = 0.75;
const AUDIO_SMOOTH_PACKET_MISSING_UP = 0.20;
const AUDIO_SMOOTH_PACKET_MISSING_DOWN = 0.75;

let real = 0;
let fake = 0;
class Thresholds
{
  l2: number;
  l3: number;
  l4: number;
  l5: number;
  constructor(l5: number, l4: number, l3: number, l2: number) {
    this.l2 = l2;
    this.l3 = l3;
    this.l4 = l4;
    this.l5 = l5;
  }

  compare(value: number,  threshold: number): boolean {
    return value < threshold;
  }

  getLevel(value: number|undefined, debug: string = 'getLevel'): number {
    if (typeof value !== 'number' || isNaN(value)) {
      fake++;
      return MAX_QUALITY_LEVEL;
    }
    real++;

    let result = 0;
    if (this.compare(value, this.l5)) {
      result = 5;
    } else if (this.compare(value, this.l4)) {
      result = 4;
    } else if (this.compare(value, this.l3)) {
      result = 3;
    } else if (this.compare(value, this.l2)) {
      result = 2;
    } else {
      result = 1;
    }

    console.log(`${debug} value:(${result})`, value, this.l5, this.l4, this.l3, this.l2);
    return result;
  }
};

class LatencyThresholds extends Thresholds {
  compare(value: number,  threshold: number): boolean {
    return value < threshold;
  }
};

class FractionLostThresholds extends Thresholds {
  compare(value: number,  threshold: number): boolean {
    return value < threshold;
  }
};

class BandwidthThresholds extends Thresholds {
  compare(value: number,  threshold: number): boolean {
    return value > threshold;
  }
};

const audioLatencyTh = new LatencyThresholds(AUDIO_LATENCY_THRESHOLD_5, AUDIO_LATENCY_THRESHOLD_4, AUDIO_LATENCY_THRESHOLD_3, AUDIO_LATENCY_THRESHOLD_2);
const videoLatencyTh = new LatencyThresholds(VIDEO_LATENCY_THRESHOLD_5, VIDEO_LATENCY_THRESHOLD_4, VIDEO_LATENCY_THRESHOLD_3, VIDEO_LATENCY_THRESHOLD_2);
const audioFractionLostTh = new FractionLostThresholds(AUDIO_FRACTION_LOST_THRESHOLD_5, AUDIO_FRACTION_LOST_THRESHOLD_4, AUDIO_FRACTION_LOST_THRESHOLD_3, AUDIO_FRACTION_LOST_THRESHOLD_2);
const videoFractionLostTh = new FractionLostThresholds(VIDEO_FRACTION_LOST_THRESHOLD_5, VIDEO_FRACTION_LOST_THRESHOLD_4, VIDEO_FRACTION_LOST_THRESHOLD_3, VIDEO_FRACTION_LOST_THRESHOLD_2);
const videoBandwidthTh = new BandwidthThresholds(VIDEO_BANDWIDTH_THRESHOLD_5, VIDEO_BANDWIDTH_THRESHOLD_4, VIDEO_BANDWIDTH_THRESHOLD_3, VIDEO_BANDWIDTH_THRESHOLD_2);
const audioBandwidthTh = new BandwidthThresholds(0, 0, 0, 0);

type QualityLevel = {
  qualityLevel: number;
  latencyQualityLevel: number;
  lossQualityLevel: number;
  bandwidthQualityLevel: number;
};

function smooth(prev: number, actual: number, betaUp: number, betaDown: number) {
  if (prev >= actual) {
    return prev * betaDown + actual * (1 - betaDown);
  }

  return prev * betaUp + actual * (1 - betaUp);
}

class NetworkQualityAlgorithm {
  bStats: BrowserStats;
  constructor(){
    this.bStats = { bitrate: 0, fractionLost: 0, jitter: 0, rtt: 0 };
  }

  computeBandwidthQuality(): number {
    throw new Error('computeBandwidthQuality not implemented');
  }
  computeLatencyQuality(): number {
    throw new Error('computeLatencyQuality not implemented');
  }
  computeLossQualityLevel() : number {
    throw new Error('computeLossQualityLevel not implemented');
  }

  smooth(actual: BrowserStats) {
    throw new Error('smooth: not implemented');
  };

  computeNetworkQuality(): QualityLevel {
    const bandwidthQualityLevel = this.computeBandwidthQuality();
    const latencyQualityLevel = this.computeLatencyQuality();
    const lossQualityLevel = this.computeLossQualityLevel();
    const qualityLevel = Math.min(bandwidthQualityLevel, latencyQualityLevel, lossQualityLevel);
    return { bandwidthQualityLevel,  latencyQualityLevel, lossQualityLevel, qualityLevel };
  }
}

// outbound
class NetworkQualityAlgorithmOutBound extends NetworkQualityAlgorithm {
  updateBrowserStats(recvStats: TrackRecvStats, iceStats: IceStats): QualityLevel {
    let bs: BrowserStats = {
      bitrate: recvStats.bitrate,
      rtt: recvStats.rtt || iceStats.rtt,
      jitter: 0,
      fractionLost: recvStats.fractionLost,
    }

    this.smooth(bs);
    return this.computeNetworkQuality();
  }
}

class NetworkQualityAlgorithmVideoOutbound extends NetworkQualityAlgorithmOutBound {
  computeBandwidthQuality(): number {
    return videoBandwidthTh.getLevel(this.bStats.bitrate, 'video out bitrate');
  }
  computeLatencyQuality(): number {
    return videoLatencyTh.getLevel(this.bStats.rtt, 'video out latency');
  }
  computeLossQualityLevel() : number {
    return videoFractionLostTh.getLevel(this.bStats.fractionLost, 'video out loss');
  }

  smooth(actual: BrowserStats) {
    if (actual.bitrate) {
      this.bStats.bitrate = actual.bitrate;
    }
    this.bStats.rtt = smooth(this.bStats.rtt, actual.rtt, SMOOTH_RTT_UP, SMOOTH_RTT_DOWN);
    this.bStats.fractionLost = smooth(this.bStats.fractionLost, actual.fractionLost, VIDEO_OUTBOUND_SMOOTH_FRACTION_LOST_UP, VIDEO_OUTBOUND_SMOOTH_FRACTION_LOST_DOWN);
  }
}

class NetworkQualityAlgorithmAudioOutbound extends NetworkQualityAlgorithmOutBound {
  computeBandwidthQuality(): number {
    // we don't use audio tracks for bandwidth quality.
    return MAX_QUALITY_LEVEL;
  }
  computeLatencyQuality(): number {
    return audioLatencyTh.getLevel(this.bStats.rtt, 'audio outbound latency');
  }
  computeLossQualityLevel() : number {
    return audioFractionLostTh.getLevel(this.bStats.fractionLost, 'audio outbound loss');
  }

  smooth(actual: BrowserStats) {
    if (actual.bitrate) {
      this.bStats.bitrate = actual.bitrate;
    }

    this.bStats.rtt = smooth(this.bStats.rtt, actual.rtt, SMOOTH_RTT_UP, SMOOTH_RTT_DOWN);
    this.bStats.fractionLost = smooth(this.bStats.fractionLost, actual.fractionLost, AUDIO_SMOOTH_PACKET_MISSING_UP, AUDIO_SMOOTH_PACKET_MISSING_DOWN);
  }
}

// inbound
class NetworkQualityAlgorithmInBound extends NetworkQualityAlgorithm {
  updateBrowserStats(sendStats: TrackSendStats, iceStats: IceStats) : QualityLevel {
    let bs: BrowserStats = {
      bitrate: sendStats.bitrate,
      rtt: sendStats.rtt || iceStats.rtt,
      jitter: 0,
      fractionLost: 0,
    }

    this.smooth(bs);
    return this.computeNetworkQuality();
  }
}

class NetworkQualityAlgorithmVideoInbound extends NetworkQualityAlgorithmInBound {
  computeBandwidthQuality(): number {
    return videoBandwidthTh.getLevel(this.bStats.bitrate, 'video in bandwidth');
  }

  computeLatencyQuality() : number {
    return videoLatencyTh.getLevel(this.bStats.rtt + (2.0 * this.bStats.jitter), 'video in latency');
  }

  computeLossQualityLevel() : number {
    return videoLatencyTh.getLevel(this.bStats.fractionLost, 'video in loss');
  }

  smooth(actual: BrowserStats) {
    if (actual.bitrate) {
      this.bStats.bitrate = actual.bitrate;
    }

    this.bStats.rtt = smooth(this.bStats.rtt, actual.rtt, SMOOTH_RTT_UP, SMOOTH_RTT_DOWN);
  }
}

class NetworkQualityAlgorithmAudioInbound extends NetworkQualityAlgorithmInBound {
  computeBandwidthQuality(): number {
    // we don't use audio tracks for bandwidth quality.
    return MAX_QUALITY_LEVEL;
  }

  computeLatencyQuality() : number {
    return audioLatencyTh.getLevel(this.bStats.rtt + (2.0 * this.bStats.jitter), 'audio in latency');
  }

  computeLossQualityLevel() : number {
    return audioFractionLostTh.getLevel(this.bStats.fractionLost, 'audio in loss');
  }

  smooth(actual: BrowserStats) {
    if (actual.bitrate) {
      this.bStats.bitrate = actual.bitrate;
    }

    this.bStats.jitter = actual.jitter;
    this.bStats.rtt = smooth(this.bStats.rtt, actual.rtt, SMOOTH_RTT_UP, SMOOTH_RTT_DOWN);
  }
}

const nqaVideoOutbound = new NetworkQualityAlgorithmVideoOutbound();
const nqaVideoInbound = new NetworkQualityAlgorithmVideoInbound();
const nqaAudioOutbound = new NetworkQualityAlgorithmAudioOutbound();
const nqaAudioInbound = new NetworkQualityAlgorithmAudioInbound();

function calculateNetworkHealth(nqm: NetworkQualityMessage) {
  const videoOut = nqaVideoOutbound.updateBrowserStats(nqm.video.recv, nqm.ice)
  const videoIn = nqaVideoInbound.updateBrowserStats(nqm.video.send, nqm.ice);
  const audioOut = nqaAudioOutbound.updateBrowserStats(nqm.audio.recv, nqm.ice);
  const audioIn = nqaAudioInbound.updateBrowserStats(nqm.audio.send, nqm.ice);
  const qualityLevel = Math.min(audioIn.qualityLevel, audioOut.qualityLevel, videoIn.qualityLevel, videoOut.qualityLevel);
  console.log({ qualityLevel, videoOut, videoIn, audioOut, audioIn, });
  return { qualityLevel, videoOut, videoIn, audioOut, audioIn, };
}

function getFakes() {
  return { real, fake };
}

module.exports = {
  calculateNetworkHealth,
  getFakes
}
