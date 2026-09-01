const ratingRank = Object.freeze({ again: 1, hard: 2, good: 3, easy: 4 });

/**
 * @typedef {object} OptimizerEvidenceRow
 * @property {string} eventId
 * @property {string} userId
 * @property {string} caseId
 * @property {number} completedAt
 * @property {'again'|'hard'|'good'|'easy'} rating
 * @property {number} generation
 * @property {number} reviewSequenceEpoch
 * @property {number} sequenceNo
 */

/** @param {OptimizerEvidenceRow} left @param {OptimizerEvidenceRow} right */
function compareEvidence(left, right) {
  return (
    left.userId.localeCompare(right.userId) ||
    left.caseId.localeCompare(right.caseId) ||
    left.generation - right.generation ||
    left.reviewSequenceEpoch - right.reviewSequenceEpoch ||
    left.sequenceNo - right.sequenceNo ||
    left.eventId.localeCompare(right.eventId)
  );
}

/**
 * The optimizer must never infer logical order from wall-clock timestamps.
 * `sequenceNo` is reset to 1 for each independent
 * (learner, Case, generation, review-sequence epoch) history.
 *
 * @param {OptimizerEvidenceRow[]} rows
 */
export function orderOptimizerEvidence(rows) {
  return [...rows].sort(compareEvidence);
}

/**
 * Reject suffixes/gaps rather than feeding them to a future optimizer as if the
 * first retained row were a New-card first review.
 *
 * @param {OptimizerEvidenceRow[]} rows
 */
export function validateCompleteOptimizerSequences(rows) {
  const ordered = orderOptimizerEvidence(rows);
  let previousKey = null;
  let expectedSequenceNo = 1;

  for (const row of ordered) {
    if (!ratingRank[row.rating]) {
      throw new TypeError(`Unsupported optimizer rating for event ${row.eventId}.`);
    }
    if (!Number.isInteger(row.sequenceNo) || row.sequenceNo < 1) {
      throw new TypeError(`Invalid optimizer sequence number for event ${row.eventId}.`);
    }

    const key = `${row.userId}\u0000${row.caseId}\u0000${row.generation}\u0000${row.reviewSequenceEpoch}`;
    if (key !== previousKey) {
      previousKey = key;
      expectedSequenceNo = 1;
    }

    if (row.sequenceNo !== expectedSequenceNo) {
      throw new Error(
        `Incomplete optimizer history for ${row.caseId}: expected sequence ${expectedSequenceNo}, received ${row.sequenceNo}.`
      );
    }
    expectedSequenceNo += 1;
  }

  return ordered;
}

/**
 * Returns portable optimizer input grouped strictly across Reset/Fresh
 * boundaries. A later optimizer PR owns the concrete optimizer library shape.
 *
 * @param {OptimizerEvidenceRow[]} rows
 */
export function groupOptimizerEvidence(rows) {
  const ordered = validateCompleteOptimizerSequences(rows);
  /** @type {Map<string, {userId:string, caseId:string, generation:number, reviewSequenceEpoch:number, reviews:Array<{eventId:string, sequenceNo:number, completedAt:number, rating:'again'|'hard'|'good'|'easy'}>}>} */
  const groups = new Map();

  for (const row of ordered) {
    const key = `${row.userId}:${row.caseId}:${row.generation}:${row.reviewSequenceEpoch}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        userId: row.userId,
        caseId: row.caseId,
        generation: row.generation,
        reviewSequenceEpoch: row.reviewSequenceEpoch,
        reviews: []
      };
      groups.set(key, group);
    }
    group.reviews.push({
      eventId: row.eventId,
      sequenceNo: row.sequenceNo,
      completedAt: row.completedAt,
      rating: row.rating
    });
  }

  return [...groups.values()];
}