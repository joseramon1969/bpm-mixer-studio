/** Local tempo estimation. No audio leaves the browser. */
type AudioSamples = Pick<
  AudioBuffer,
  'sampleRate' | 'length' | 'numberOfChannels' | 'getChannelData'
>

export function detectTempo(buffer: AudioSamples): number | undefined {
  const { sampleRate, length, numberOfChannels } = buffer
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !numberOfChannels ||
    length / sampleRate < 6
  )
    return
  const channels = Array.from({ length: numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  )
  const hop = Math.max(1, Math.round(sampleRate / 200))
  const frameRate = sampleRate / hop
  const windowSize = Math.min(length, Math.round(sampleRate * 24))
  const windows = Math.min(7, Math.max(1, Math.ceil(length / windowSize)))
  const minLag = Math.floor((frameRate * 60) / 200)
  const maxLag = Math.ceil((frameRate * 60) / 60) * 3 + 2
  const votes = new Float64Array(1401) // 60–200 BPM, tenths rather than integer lag bins
  let evidence = 0

  for (let section = 0; section < windows; section++) {
    const start =
      windows === 1
        ? 0
        : Math.floor(((length - windowSize) * section) / (windows - 1))
    const frames = Math.floor(windowSize / hop)
    const energy = new Float64Array(frames)
    // Sum channel energies, not waveforms: opposite stereo phases must not cancel.
    for (const samples of channels) {
      let low = 0
      const alpha = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate)
      for (let frame = 0; frame < frames; frame++) {
        let bass = 0,
          full = 0
        const end = start + (frame + 1) * hop
        for (let p = start + frame * hop; p < end; p++) {
          const value = samples[p]
          low += alpha * (value - low)
          bass += low * low
          full += value * value
        }
        // Favor kick transients while retaining percussion without a strong bass drum.
        energy[frame] += Math.sqrt(bass / hop) + 0.3 * Math.sqrt(full / hop)
      }
    }
    const onset = new Float64Array(frames)
    let total = 0
    for (let n = 1; n < frames; n++) {
      onset[n] = Math.max(0, energy[n] - energy[n - 1])
      total += onset[n] * onset[n]
    }
    if (total < 1e-10) continue
    // Smooth over adjacent frames so fractional beat intervals receive the
    // same support as intervals landing exactly on a frame boundary.
    const smooth = Float64Array.from(
      onset,
      (value, n) => ((onset[n - 1] || 0) + 2 * value + (onset[n + 1] || 0)) / 4,
    )
    const correlation = new Float64Array(maxLag + 1)
    for (let lag = minLag; lag <= maxLag && lag < frames; lag++) {
      let product = 0,
        left = 0,
        right = 0,
        leftSum = 0,
        rightSum = 0
      for (let n = lag; n < frames; n++) {
        leftSum += smooth[n]
        rightSum += smooth[n - lag]
        product += smooth[n] * smooth[n - lag]
        left += smooth[n] * smooth[n]
        right += smooth[n - lag] * smooth[n - lag]
      }
      const count = frames - lag
      const variance =
        (left - (leftSum * leftSum) / count) *
        (right - (rightSum * rightSum) / count)
      correlation[lag] =
        variance > 1e-20
          ? Math.max(
              0,
              (product - (leftSum * rightSum) / count) / Math.sqrt(variance),
            )
          : 0
    }
    const at = (lag: number) => {
      const index = Math.floor(lag),
        fraction = lag - index
      return (
        (correlation[index] || 0) * (1 - fraction) +
        (correlation[index + 1] || 0) * fraction
      )
    }
    let peak = 0
    const scores = new Float64Array(votes.length)
    for (let candidate = 0; candidate < scores.length; candidate++) {
      const lag = (frameRate * 60) / (60 + candidate / 10)
      // Require repeated beats, reducing matches to a single accidental interval.
      scores[candidate] =
        (at(lag) + 0.5 * at(lag * 2) + 0.25 * at(lag * 3)) / 1.75
      peak = Math.max(peak, scores[candidate])
    }
    if (peak < 0.18) continue
    evidence++
    for (let candidate = 0; candidate < votes.length; candidate++) {
      votes[candidate] += scores[candidate] * peak
    }
  }
  if (!evidence) return
  let best = 0
  for (let candidate = 1; candidate < votes.length; candidate++) {
    if (votes[candidate] > votes[best]) best = candidate
  }
  // A repeated beat also correlates at two or three times its interval.
  // Recover the faster pulse when its evidence is comparable; quieter offbeats
  // have weaker correlations and therefore do not pass this check.
  const fundamental = 60 + best / 10
  const strongest = votes[best]
  for (const multiple of [2, 3]) {
    const target = Math.round((fundamental * multiple - 60) * 10)
    if (target >= votes.length) continue
    let faster = target
    for (
      let i = Math.max(0, target - 5);
      i <= Math.min(votes.length - 1, target + 5);
      i++
    ) {
      if (votes[i] > votes[faster]) faster = i
    }
    if (votes[faster] >= strongest * 0.85) best = faster
  }
  return Math.round((60 + best / 10) * 10) / 10
}
