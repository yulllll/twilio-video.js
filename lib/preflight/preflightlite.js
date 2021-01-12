/* eslint-disable no-console */
const EventEmitter = require('../eventemitter');
const { waitForSometime } = require('../util');
const TimeMeasurement = require('../util/timemeasurement');
const makeStat = require('../stats/makestat.js');
const { createAudioTrack, createVideoTrack } = require('./synthetic');
const SECOND = 1000;
const DEFAULT_TEST_DURATION = 10 * SECOND;
const TwilioConnection = require('../twilioconnection.js');
const { WS_SERVER, ICE_VERSION } = require('../util/constants');
const {
  getStats: getStatistics,
  RTCPeerConnection: DefaultRTCPeerConnection
} = require('@twilio/webrtc');
const  { setCodecPreferences } = require('../util/sdp/index');// lib/util/sdp/index.js


/**
 * A {@link PreflightTestLite} monitors progress of an ongoing preflight test.
 * <br><br>
 * Instance of {@link PreflightTestLite} is returned by calling {@link module:twilio-video.runPreflight}
 * @extends EventEmitter
 * @emits PreflightTest#completed
 * @emits PreflightTest#failed
 * @emits PreflightTest#progress
 */
class PreflightTestLite extends EventEmitter {
  /**
   * Constructs {@link PreflightTestLite}.
   * @param {string} token
   * @param {?PreflightOptions} [options]
   */
  constructor(token, options) {
    super();
    runPreflightTest(token, options, this);
  }

  /**
   * stops ongoing tests and emits error
   */
  stop() {
    this._stopped = true;
  }
}

/**
 * progress values that are sent by {@link PreflightTest#event:progress}
 * @enum {string}
 */
// eslint-disable-next-line
const PreflightProgress = {
  /**
   * Preflight test {@link PreflightTest} has successfully acquired media
   */
  mediaAcquired: 'mediaAcquired',

  /**
   * Preflight test {@link PreflightTest} has successfully connected both participants
   * to the room.
   */
  connected: 'connected',

  /**
   * Preflight test {@link PreflightTest} sees both participants discovered each other
   */
  remoteConnected: 'remoteConnected',

  /**
   * publisherParticipant successfully published media tracks
   */
  mediaPublished: 'mediaPublished',

  /**
   * subscriberParticipant successfully subscribed to media tracks.
   */
  mediaSubscribed: 'mediaSubscribed',

  /**
   * media flow was detected.
   */
  mediaStarted: 'mediaStarted'
};


function runPreflightTest(token, options, preflightTest) {
  const testDuration = options.duration || DEFAULT_TEST_DURATION;
  delete options.duration; // duration is not a Video.connect option.

  options = Object.assign(options, {
    video: false,
    audio: false,
    preflight: true,
    networkQuality: true
  });

  const testTiming = new TimeMeasurement();
  let alicePC = null;
  let bobPC = null;
  let localTracks = null;
  let publisherRoom = null;
  let subscriberRoom = null;
  let trackStartListener = null;

  const preferredAudioCodecs = options.preferredAudioCodecs || [];
  const preferredVideoCodecs = options.preferredVideoCodecs || [];

  /**
   *
   * @param {RTCSessionDescription} sdp;
   * @returns {RTCSessionDescriptionInit}
   */

  function updateSDP(sdp) {
    return {
      sdp: setCodecPreferences(sdp.sdp, preferredAudioCodecs, preferredVideoCodecs),
      type: sdp.type
    };
  }

  /**
   * returns turn credentials.
   */
  function getTurnCredentials() {
    return new Promise((resolve, reject) => {
      options = Object.assign({
        environment: 'prod',
        region: 'gll',
      }, options);
      const wsServer = WS_SERVER(options.environment, options.region);

      const connectionOptions = {
        networkMonitor: null,
        eventObserver: null,
        helloBody: {
          edge: 'roaming', // roaming here means use same edge as signaling.
          preflight: true,
          token: token,
          type: 'ice',
          version: ICE_VERSION
        },
      };

      /* eslint new-cap:0 */
      const twilioConnection = new TwilioConnection(wsServer, connectionOptions);
      let done = false;
      twilioConnection.once('close', reason => {
        console.log('got closed: done = ', done);
        if (!done) {
          done = true;
          reject(reason);
        }
      });

      twilioConnection.on('message', message => {
        console.log('received message of type: ', message.type, message);
        if (message.type === 'iced') {
          console.log('Got Ice Servers:', message.ice_servers);
          if (!done) {
            done = true;
            resolve(message.ice_servers);
            twilioConnection.close();
          }
        }
      });
    });
  }


  function collectIceCandidates() {
    return Promise.resolve().then(() => {
      const pc = bobPC;
      return pc.getStats().then(stats => {
        return [...stats.values()].filter(stat => {
          return stat.type === 'local-candidate' || stat.type === 'remote-candidate';
        });
      });
    }).catch(() => {
      return [];
    });
  }

  function collectRTCStats(collectedStats) {
    return Promise.all([bobPC, alicePC].map(pc => getStatistics(pc)))
      // eslint-disable-next-line consistent-return
      .then(([subscriberStats, publisherStats]) => {
        {
          const { activeIceCandidatePair } = publisherStats;
          if (activeIceCandidatePair && typeof activeIceCandidatePair.availableOutgoingBitrate === 'number') {
            collectedStats.outgoingBitrate.push(activeIceCandidatePair.availableOutgoingBitrate);
          }
        }
        {
          const { activeIceCandidatePair, remoteAudioTrackStats, remoteVideoTrackStats } = subscriberStats;
          if (activeIceCandidatePair) {
            if (typeof activeIceCandidatePair.currentRoundTripTime === 'number') {
              collectedStats.rtt.push(activeIceCandidatePair.currentRoundTripTime * 1000);
            }
            if (typeof activeIceCandidatePair.availableIncomingBitrate === 'number') {
              collectedStats.incomingBitrate.push(activeIceCandidatePair.availableIncomingBitrate);
            }

            if (!collectedStats.selectedIceCandidatePairStats) {
              collectedStats.selectedIceCandidatePairStats = {
                localCandidate: activeIceCandidatePair.localCandidate,
                remoteCandidate: activeIceCandidatePair.remoteCandidate
              };
            }
          }

          let packetsLost = 0;
          let packetsReceived = 0;
          if (remoteAudioTrackStats && remoteAudioTrackStats[0]) {
            collectedStats.jitter.push(remoteAudioTrackStats[0].jitter);
            packetsLost += remoteAudioTrackStats[0].packetsLost;
            packetsReceived += remoteAudioTrackStats[0].packetsReceived;
          }
          if (remoteVideoTrackStats && remoteVideoTrackStats[0]) {
            packetsLost += remoteVideoTrackStats[0].packetsLost;
            packetsReceived += remoteAudioTrackStats[0].packetsReceived;
          }
          collectedStats.packetLoss.push(packetsReceived ? packetsLost * 100 / packetsReceived : 0);
        }
      });
  }

  function generatePreflightReport(collectedStats) {
    testTiming.stop();
    const selectedIceCandidatePairStats = collectedStats.selectedIceCandidatePairStats;
    const isTurnRequired = selectedIceCandidatePairStats.localCandidate.candidateType === 'relay'
    || selectedIceCandidatePairStats.remoteCandidate.candidateType === 'relay';

    return {
      // roomSid: subscriberRoom.sid,
      // mediaRegion: subscriberRoom.mediaRegion,
      // signalingRegion: subscriberRoom.localParticipant.signalingRegion,
      testTiming: testTiming.toJSON(),
      networkTiming: {
        // connect: connectTiming.toJSON(),
        // media: mediaTiming.toJSON(),
      },
      stats: {
        jitter: makeStat(collectedStats.jitter),
        rtt: makeStat(collectedStats.rtt),
        outgoingBitrate: makeStat(collectedStats.outgoingBitrate),
        incomingBitrate: makeStat(collectedStats.incomingBitrate),
        packetLoss: makeStat(collectedStats.packetLoss),
      },
      selectedIceCandidatePairStats,
      isTurnRequired,
      iceCandidateStats: collectedStats.iceCandidateStats
    };
  }

  function collectRTCStatsForDuration(duration, collectedStats = null) {
    const startTime = Date.now();
    const STAT_INTERVAL = 1000;
    if (collectedStats === null) {
      collectedStats = {
        jitter: [],
        rtt: [],
        outgoingBitrate: [],
        incomingBitrate: [],
        packetLoss: [],
        selectedIceCandidatePairStats: null,
        iceCandidateStats: [],
      };
    }
    return waitForSometime(STAT_INTERVAL).then(() => {
      return collectRTCStats(collectedStats).then(() => {
        const remainingDuration = duration - (Date.now() - startTime);
        return (remainingDuration > 0) ? collectRTCStatsForDuration(remainingDuration, collectedStats) : collectedStats;
      });
    }).then(() => {
      return collectIceCandidates().then(iceCandidates => {
        collectedStats.iceCandidateStats = iceCandidates;
        return collectedStats;
      });
    });
  }

  function realTest(iceServers, audioTrack, videoTrack) {
    return new Promise((resolve, reject) => {
      alicePC = new DefaultRTCPeerConnection({ iceServers, iceTransportPolicy: 'relay' });
      bobPC = new DefaultRTCPeerConnection({ iceServers });

      alicePC.addEventListener('icecandidate', event => event.candidate && bobPC.addIceCandidate(event.candidate));
      bobPC.addEventListener('icecandidate', event => event.candidate && alicePC.addIceCandidate(event.candidate));

      let remoteTracks = [];
      bobPC.addEventListener('track', event => {
        console.log('got track:', event.track);
        remoteTracks.push(event.track);
        if (remoteTracks.length === 2) {
          resolve({ alicePC, bobPC, remoteTracks });
        }
      });

      alicePC.addTrack(audioTrack);
      alicePC.addTrack(videoTrack);
      alicePC.createOffer().then(offer => {
        const updatedSDP = updateSDP(offer);
        return Promise.all([
          alicePC.setLocalDescription(updatedSDP),
          bobPC.setRemoteDescription(updatedSDP)
        ]);
      }).then(() => {
        return bobPC.createAnswer();
      }).then(answer => {
        const updatedSDP = updateSDP(answer);
        return Promise.all([
          bobPC.setLocalDescription(updatedSDP),
          alicePC.setRemoteDescription(updatedSDP)
        ]);
      }).catch(error => {
        reject(error);
      });
    });
  }

  /**
   * returns a promise to executes given step
   * rejects the return promise if
   * a) preflight is stopped.
   * b) subscriber or publisher disconnects
   * c) step does not complete in reasonable time.
   * @param {function} step - function to execute
   * @param {string} stepName - name for the step
   */
  function executePreflightStep(stepName, step) {
    const MAX_STEP_DURATION = testDuration + 10 * SECOND;
    if (preflightTest._stopped) {
      throw new Error('stopped');
    }

    if (subscriberRoom && subscriberRoom.state === 'disconnected') {
      throw new Error('subscriber disconnected unexpectedly');
    }

    if (publisherRoom && publisherRoom.state === 'disconnected') {
      throw new Error('publisher disconnected unexpectedly');
    }

    const stepPromise = Promise.resolve().then(step);
    let timer = null;
    const timeoutPromise = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for : ${stepName}`));
      }, MAX_STEP_DURATION);
    });
    return Promise.race([timeoutPromise, stepPromise]).finally(() => {
      clearTimeout(timer);
    });
  }

  let audioTrack = null;
  let videoTrack = null;
  return Promise.resolve()
    .then(() => {
      return executePreflightStep('acquire media', () => {
        audioTrack = createAudioTrack();
        videoTrack = createVideoTrack();
      });
    }).then(() => {
      return executePreflightStep('connect', () => {
        return getTurnCredentials();
      });
    }).then(turnServers => {
      return executePreflightStep('realTest', () => {
        return realTest(turnServers, audioTrack, videoTrack);
      });
    }).then(() => {
      return executePreflightStep('collect stats', () => {
        return collectRTCStatsForDuration(testDuration);
      });
    }).then(collectedStats => {
      return executePreflightStep('generate report', () => {
        return generatePreflightReport(collectedStats);
      });
    }).then(report => {
      preflightTest.emit('completed', report);
    }).catch(error => {
      preflightTest.emit('failed', error);
    }).finally(() => {
      if (trackStartListener) {
        trackStartListener.stop();
        trackStartListener = null;
      }

      if (publisherRoom) {
        publisherRoom.disconnect();
        publisherRoom = null;
      }

      if (subscriberRoom) {
        subscriberRoom.disconnect();
        subscriberRoom = null;
      }

      if (localTracks) {
        localTracks.forEach(track => track.stop());
        localTracks = null;
      }
    });
}

/**
 * Represents network timing measurements captured during preflight test
 * @typedef {object} NetworkTiming
 * @property {TimeMeasurement} [connect] - Time to establish connection. This is measured from initiating a connection using `Video.connect()`
 *  up to when the connect promise resolves
 * @property {TimeMeasurement} [media] - Time to start media. This is measured from calling connect to remote media getting started.
 */

/**
 * Represents stats for a numerical metric.
 * @typedef {object} Stats
 * @property  {number} [average] - average value observed.
 * @property  {number} [max] - mix value observed.
 * @property  {number} [min] - min value observed.
 */

/**
 * Represents stats for a numerical metric.
 * @typedef {object} SelectedIceCandidatePairStats
 * @property  {RTCIceCandidateStats} [localCandidate] - selected local ice candidate
 * @property  {RTCIceCandidateStats} [remoteCandidate] - selected local ice candidate
 */

/**
 * Represents RTC related stats that were observed during preflight test
 * @typedef {object} RTCStats
 * @property {Stats} [jitter] - Packets delay variation on audio tracks
 * @property {Stats} [rtt] - Round trip time, to the server back to the client in milliseconds.
 * @property {Stats} [networkQuality] - network quality score (1 to 5), available only for group rooms
 * @property {Stats} [outgoingBitrate] - Outgoing bitrate in bits per second.
 * @property {Stats} [incomingBitrate] - Incoming bitrate in bits per second.
 * @property {Stats} [packetLoss] - Packet loss as a percent of total packets sent.
*/

/**
 * Represents report generated by {@link PreflightTest}.
 * @typedef {object} PreflightTestReport
 * @property {string} [roomSid] - Room sid.
 * @property {string} [signalingRegion] - Connected signaling region.
 * @property {string} [mediaRegion] - Connected media region (Group Room only).
 * @property {TimeMeasurement} [testTiming] - Time measurements of test run time.
 * @property {NetworkTiming} [networkTiming] - Network related time measurements.
 * @property {RTCStats} [stats] - RTC related stats captured during the test.
 * @property {boolean} [isTurnRequired] - is set to true if turn servers were used for the media.
 * @property {Array<RTCIceCandidateStats>} [iceCandidateStats] - List of gathered ice candidates.
 * @property {SelectedIceCandidatePairStats} selectedIceCandidatePairStats;
 */

/**
 * Preflight test has completed successfully.
 * @param {PreflightTestReport} report - results of the test.
 * @event PreflightTest#completed
 */

/**
 * Preflight test has encountered a failed and is now stopped.
 * @param {TwilioError|Error} error - error object
 * @event PreflightTest#failed
 */

/**
 * Emitted to indicate progress of the test
 * @param {PreflightProgress} progress - indicates the status completed.
 * @event PreflightTest#progress
 */


module.exports = PreflightTestLite;
