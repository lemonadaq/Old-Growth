import { RESOURCE_IDS } from '../content/resources';
import type { Simulation } from './simulation';

/**
 * Temporary debug scaffolding. Registers one producer per resource so the HUD
 * visibly shows all seven resources ticking, then can tear them all down again.
 *
 * TODO: remove once real production systems (Sap clicks, canopy Light, root
 * Water/Minerals) drive the economy.
 */

/** Shared prefix so every test producer id is easy to identify and remove. */
const TEST_PRODUCER_PREFIX = 'debug:test-producer';

/** Register a `+1/s` producer for every resource. */
export function enableTestProducers(sim: Simulation, ratePerSecond = 1): void {
  for (const id of RESOURCE_IDS) {
    sim.addProducer({
      id: `${TEST_PRODUCER_PREFIX}:${id}`,
      resource: id,
      baseRate: ratePerSecond,
      tags: ['debug'],
    });
  }
}

/** Remove all producers added by {@link enableTestProducers}. */
export function disableTestProducers(sim: Simulation): void {
  for (const id of RESOURCE_IDS) {
    sim.removeProducer(`${TEST_PRODUCER_PREFIX}:${id}`);
  }
}
