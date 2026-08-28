/**
 * A fake `AudioContext`, for the audio tests.
 *
 * Vitest runs in Node, where WebAudio does not exist — but "does the click cue
 * actually schedule a node, and does muting actually silence the bus" are the
 * only questions worth asking about this code, and both are answerable against a
 * recording stub. What is faked is deliberately shallow: every node records the
 * calls made to it and what it was connected to, and nothing produces a sample.
 *
 * Kept as a module rather than inside one test file because three test files
 * need it, and kept out of `*.test.ts` so the runner does not treat it as a
 * suite with no assertions in it.
 */

/** One scheduled change to an `AudioParam`. */
export interface ParamEvent {
  readonly kind: 'set' | 'linear' | 'exponential' | 'cancel';
  readonly value: number;
  readonly at: number;
}

export class FakeParam {
  value: number;
  readonly events: ParamEvent[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  setValueAtTime(value: number, at: number): FakeParam {
    this.value = value;
    this.events.push({ kind: 'set', value, at });
    return this;
  }

  linearRampToValueAtTime(value: number, at: number): FakeParam {
    this.value = value;
    this.events.push({ kind: 'linear', value, at });
    return this;
  }

  exponentialRampToValueAtTime(value: number, at: number): FakeParam {
    this.value = value;
    this.events.push({ kind: 'exponential', value, at });
    return this;
  }

  cancelScheduledValues(at: number): FakeParam {
    this.events.push({ kind: 'cancel', value: this.value, at });
    return this;
  }
}

/** Everything the code under test does to a node, recorded. */
export class FakeNode {
  readonly connections: FakeNode[] = [];
  startedAt: number | null = null;
  stoppedAt: number | null = null;

  constructor(
    readonly kind: string,
    readonly ctx: FakeAudioContext,
  ) {}

  connect(target: FakeNode): FakeNode {
    this.connections.push(target);
    return target;
  }

  disconnect(): void {
    this.connections.length = 0;
  }

  start(at = 0): void {
    this.startedAt = at;
    this.ctx.started.push(this);
  }

  stop(at = 0): void {
    this.stoppedAt = at;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

export class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
}

export class FakeFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

export class FakeBufferSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state: AudioContextState = 'running';
  readonly destination = new FakeNode('destination', this);

  /** Every node that was started, in the order it was started. */
  readonly started: FakeNode[] = [];
  /** Every node ever created, for counting what a cue actually built. */
  readonly created: FakeNode[] = [];

  private track<T extends FakeNode>(node: T): T {
    this.created.push(node);
    return node;
  }

  createGain(): FakeGain {
    return this.track(new FakeGain('gain', this));
  }

  createOscillator(): FakeOscillator {
    return this.track(new FakeOscillator('oscillator', this));
  }

  createBiquadFilter(): FakeFilter {
    return this.track(new FakeFilter('filter', this));
  }

  createBufferSource(): FakeBufferSource {
    return this.track(new FakeBufferSource('bufferSource', this));
  }

  createBuffer(channels: number, frames: number, sampleRate: number): AudioBuffer {
    const data = new Float32Array(frames);
    return {
      length: frames,
      duration: frames / sampleRate,
      numberOfChannels: channels,
      sampleRate,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  /** Nodes of one kind, for the assertions. */
  nodesOfKind(kind: string): FakeNode[] {
    return this.created.filter((node) => node.kind === kind);
  }
}

/** The fake, typed as the real thing for the code under test. */
export function fakeContext(): { ctx: AudioContext; fake: FakeAudioContext } {
  const fake = new FakeAudioContext();
  return { ctx: fake as unknown as AudioContext, fake };
}
