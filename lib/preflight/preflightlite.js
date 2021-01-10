/* eslint-disable no-console */
const EventEmitter = require('../eventemitter');
const { waitForSometime } = require('../util');
const TimeMeasurement = require('../util/timemeasurement');
const makeStat = require('../stats/makestat.js');
const { createAudioTrack, createVideoTrack } = require('./synthetic');
const LocalAudioTrack = require('../media/track/es5/localaudiotrack');
const LocalVideoTrack = require('../media/track/es5/localvideotrack');
const SECOND = 1000;
const DEFAULT_TEST_DURATION = 10 * SECOND;
const TwilioConnection = require('../twilioconnection.js');
const { WS_SERVER, ICE_VERSION } = require('../util/constants');

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
  let localTracks = null;
  let publisherRoom = null;
  let subscriberRoom = null;
  let trackStartListener = null;
  let connectTiming = null;
  let mediaTiming = null;

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
          done = true;
          resolve(message.ice_servers);
          twilioConnection.close();
        }
      });
    });
  }


  function collectIceCandidates() {
    return Promise.resolve().then(() => {
      const pc = subscriberRoom._signaling._peerConnectionManager._peerConnections.values().next().value._peerConnection._peerConnection;
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
    return Promise.all([subscriberRoom, publisherRoom].map(room => room._signaling.getStats()))
      // eslint-disable-next-line consistent-return
      .then(([subscriberStats, publisherStats]) => {
        const subscriberStatValues = [...subscriberStats.values()];
        const publisherStatValues = [...publisherStats.values()];

        if (publisherStatValues.length > 0) {
          const { activeIceCandidatePair } = publisherStatValues[0];
          if (activeIceCandidatePair && typeof activeIceCandidatePair.availableOutgoingBitrate === 'number') {
            collectedStats.outgoingBitrate.push(activeIceCandidatePair.availableOutgoingBitrate);
          }
        }
        if (subscriberStatValues.length > 0) {
          const { activeIceCandidatePair, remoteAudioTrackStats, remoteVideoTrackStats } = subscriberStatValues[0];
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
      roomSid: subscriberRoom.sid,
      mediaRegion: subscriberRoom.mediaRegion,
      signalingRegion: subscriberRoom.localParticipant.signalingRegion,
      testTiming: testTiming.toJSON(),
      networkTiming: {
        connect: connectTiming.toJSON(),
        media: mediaTiming.toJSON(),
      },
      stats: {
        jitter: makeStat(collectedStats.jitter),
        rtt: makeStat(collectedStats.rtt),
        outgoingBitrate: makeStat(collectedStats.outgoingBitrate),
        incomingBitrate: makeStat(collectedStats.incomingBitrate),
        packetLoss: makeStat(collectedStats.packetLoss),
        networkQuality: makeStat(collectedStats.networkQuality),
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

  // @returns {Array<number>}
  function collectNetworkQualityForDuration(duration) {
    const networkQuality = [];
    const localParticipant = subscriberRoom.localParticipant;
    if (localParticipant.networkQualityLevel) {
      networkQuality.push(localParticipant.networkQualityLevel);
    }
    const networkQualityCallback = () => networkQuality.push(localParticipant.networkQualityLevel);
    localParticipant.addListener('networkQualityLevelChanged', networkQualityCallback);
    return waitForSometime(duration).then(() => {
      localParticipant.removeListener('networkQualityLevelChanged', networkQualityCallback);
      return networkQuality;
    });
  }

  function collectStatsForDuration(duration) {
    return Promise.all([
      collectNetworkQualityForDuration(duration),
      collectRTCStatsForDuration(duration),
    ]).then(([networkQuality, collectedStats]) => {
      collectedStats.networkQuality = networkQuality;
      return collectedStats;
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

  return Promise.resolve()
    .then(() => {
      return executePreflightStep('acquire media', () => {
        return [
          new LocalAudioTrack(createAudioTrack(), { workaroundWebKitBug1208516: false, workaroundWebKitBug180748: false }),
          new LocalVideoTrack(createVideoTrack(), { workaroundWebKitBug1208516: false, workaroundSilentLocalVideo: false })
        ];
      });
    }).then(tracks => {
      console.log('tracks:', tracks);
      return executePreflightStep('connect', () => {
        return getTurnCredentials();
      });
    }).then(turnServers => {
      console.log('turn_servers = ', turnServers);
      throw new Error('Done');
    }).then(() => {
      return executePreflightStep('collect stats', () => {
        return collectStatsForDuration(testDuration);
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
