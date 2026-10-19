// Requests from the page, validated by the server (architecture rule 8). Kept out of the page bundle.
import { z } from 'zod';

export const SeatId = z.string().uuid();

export const OpenSeatBody = z.object({
  token: z.string().min(1).max(512),
  /** The seat this tab held before, if any: the server closes its casino session. */
  seat: SeatId.optional(),
});

export const SpinBody = z.object({
  seat: SeatId,
  coins: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Missing means 1x, as before the multiplier existed. */
  multiplier: z.union([z.literal(1), z.literal(5), z.literal(10)]).default(1),
  /** Chosen by the page per pull, so a retried request never spins twice. */
  spin: z.string().uuid(),
});
