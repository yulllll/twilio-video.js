const r0 = 94.768; // Constant used in computing "rFactor".

function calculateMOS(rtt, jitter, fractionLost) {
  // Compute the effective latency.
  const effectiveLatency = rtt + (jitter * 2) + 10;

  // Compute the initial "rFactor" from effective latency.
  let rFactor = 0;
  switch (true) {
    case effectiveLatency < 160:
      rFactor = r0 - (effectiveLatency / 40);
      break;
    case effectiveLatency < 1000:
      rFactor = r0 - ((effectiveLatency - 120) / 10);
      break;
  }

  // Adjust "rFactor" with the fraction of packets lost.
  switch (true) {
    case fractionLost <= (rFactor / 2.5):
      rFactor = Math.max(rFactor - fractionLost * 2.5, 6.52);
      break;
    default:
      rFactor = 0;
      break;
  }

  // Compute MOS from "rFactor".
  const mos = 1 +
    (0.035 * rFactor) +
    (0.000007 * rFactor) *
    (rFactor - 60) *
    (100 - rFactor);

  return mos;
}

module.exports = {
  calculateMOS
};


