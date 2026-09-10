// Read-only candidate discovery for Tranche-2 visual duplicate discovery.
//
// Candidate membership follows docs/ADMIN_IMAGE_DEDUPLICATION_PLAN.md section 19:
// only active, non-Preview, non-superseded, non-tombstoned Production image Assets
// are eligible, Topic scope is the default, System scope is an explicit recursive
// widening, and global scope is only ever explicit. Nothing here mutates.

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { getTeachingImageUrl } from '../storage/media.js';
import { assets, concepts } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const VISUAL_DISCOVERY_MAX_ASSETS = 120;
export const VISUAL_DISCOVERY_SCOPES = /** @type {const} */ (['topic', 'system', 'global']);

export class AssetVisualDiscoveryInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AssetVisualDiscoveryInputError';
  }
}

function eligibleConditions() {
  return and(
    eq(assets.type, 'image'),
    isNull(assets.previewSessionId),
    eq(assets.isActive, true),
    isNull(assets.deduplicatedIntoAssetId),
    isNull(assets.supersededByAssetId)
  );
}

/**
 * Current learner-relevant Production usage restricted to Cases whose canonical
 * Primary Topic satisfies the supplied condition.
 * @param {import('drizzle-orm').SQL} primaryTopicCondition
 */
function currentUsageExists(primaryTopicCondition) {
  return sql`exists (
    select 1
    from cases discovery_case
    where discovery_case.preview_session_id is null
      and discovery_case.is_active = true
      and (
        exists (
          select 1 from case_assets discovery_ca
          where discovery_ca.case_id = discovery_case.id
            and discovery_ca.asset_id = ${assets.id}
        )
        or exists (
          select 1
          from stimulus_group_options discovery_sgo
          join stimulus_groups discovery_sg on discovery_sg.id = discovery_sgo.stimulus_group_id
          where discovery_sg.case_id = discovery_case.id
            and discovery_sgo.asset_id = ${assets.id}
            and discovery_sg.is_active = true
            and discovery_sgo.is_active = true
            and discovery_sgo.removed_from_case = false
        )
      )
      and exists (
        select 1
        from case_concepts discovery_cc
        where discovery_cc.case_id = discovery_case.id
          and discovery_cc.role = 'primary'
          and ${primaryTopicCondition}
      )
  )`;
}

/**
 * Recursive ancestry condition: the Primary Topic's ancestor chain contains the
 * selected System at any depth (never direct-parent only).
 * @param {string} systemId
 */
function systemAncestryCondition(systemId) {
  return sql`exists (
    with recursive discovery_ancestors(id, parent_id) as (
      select concept_start.id, concept_start.parent_id
      from concepts concept_start
      where concept_start.id = discovery_cc.concept_id
      union all
      select concept_parent.id, concept_parent.parent_id
      from concepts concept_parent
      join discovery_ancestors on discovery_ancestors.parent_id = concept_parent.id
    )
    select 1 from discovery_ancestors where discovery_ancestors.id = ${systemId}
  )`;
}

/** @param {unknown} value @param {string} label */
function requiredId(value, label) {
  const id = String(value ?? '').trim();
  if (!id) throw new AssetVisualDiscoveryInputError(`Choose a ${label} before starting this search.`);
  return id;
}

/**
 * Lists active Production image Assets eligible for Topic, recursive-System, or
 * explicit global visual duplicate discovery.
 * @param {LearningDb} db
 * @param {{ scope?: string, topicId?: string, systemId?: string }} [input]
 */
export async function listVisualDuplicateCandidates(db, input = {}) {
  const scope = String(input.scope ?? '').trim();
  if (!VISUAL_DISCOVERY_SCOPES.includes(/** @type {any} */ (scope))) {
    throw new AssetVisualDiscoveryInputError('Choose Topic, System, or global discovery scope.');
  }

  let condition = null;
  let scopeLabel = 'Global Production image library';
  let scopeId = '';
  if (scope === 'topic') {
    scopeId = requiredId(input.topicId, 'Primary Topic');
    condition = currentUsageExists(sql`discovery_cc.concept_id = ${scopeId}`);
  } else if (scope === 'system') {
    scopeId = requiredId(input.systemId, 'System');
    condition = currentUsageExists(systemAncestryCondition(scopeId));
  }

  if (scopeId) {
    const [concept] = await db.select({ id: concepts.id, name: concepts.name, kind: concepts.kind }).from(concepts).where(eq(concepts.id, scopeId)).limit(1);
    const expectedKind = scope === 'topic' ? 'topic' : 'system';
    if (!concept || concept.kind !== expectedKind) {
      throw new AssetVisualDiscoveryInputError(scope === 'topic' ? 'That Primary Topic no longer exists.' : 'That System no longer exists.');
    }
    scopeLabel = `${concept.name} (${scope === 'topic' ? 'Topic' : 'System'} ${concept.id})`;
  }

  const where = condition ? and(eligibleConditions(), condition) : eligibleConditions();
  const rows = await db
    .select({ id: assets.id, originalFilename: assets.originalFilename, altText: assets.altText, mimeType: assets.mimeType })
    .from(assets)
    .where(where)
    .orderBy(asc(assets.id))
    .limit(VISUAL_DISCOVERY_MAX_ASSETS);
  const [countRow] = await db.select({ totalCount: sql`count(*)`.mapWith(Number) }).from(assets).where(where);
  const totalCount = Number(countRow?.totalCount ?? rows.length);

  return {
    scope,
    scopeId: scopeId || null,
    scopeLabel,
    totalCount,
    truncated: totalCount > VISUAL_DISCOVERY_MAX_ASSETS,
    maxAssets: VISUAL_DISCOVERY_MAX_ASSETS,
    candidates: rows.map((row) => ({
      id: row.id,
      originalFilename: row.originalFilename,
      altText: row.altText,
      mimeType: row.mimeType,
      imageUrl: getTeachingImageUrl(row.id)
    }))
  };
}

/**
 * Active taxonomy options for the discovery scope controls.
 * @param {LearningDb} db
 */
export async function listVisualDuplicateScopes(db) {
  const rows = await db
    .select({ id: concepts.id, name: concepts.name, kind: concepts.kind })
    .from(concepts)
    .where(eq(concepts.isActive, true))
    .orderBy(asc(concepts.name), asc(concepts.id));
  return {
    topics: rows.filter((row) => row.kind === 'topic').map((row) => ({ id: row.id, name: row.name })),
    systems: rows.filter((row) => row.kind === 'system').map((row) => ({ id: row.id, name: row.name }))
  };
}
