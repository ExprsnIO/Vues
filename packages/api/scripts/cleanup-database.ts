/**
 * Database Cleanup Script
 *
 * Removes all demo/seed data, leaving only:
 * - User: rickholland (did:exprsn:rickholland)
 * - Organization: Exprsn.io (enterprise org owned by rickholland)
 * - Domain: exprsn.io
 * - Service accounts: prefetch-worker
 *
 * Run: cd packages/api && npx tsx scripts/cleanup-database.ts
 */

import { db } from '../src/db/index.js';
import { sql } from 'drizzle-orm';

const KEEP_DID = 'did:exprsn:rickholland';
const KEEP_SERVICE_DID = 'did:exprsn:prefetch-worker';
const KEEP_ORG_NAME = 'Exprsn.io';
const KEEP_DOMAIN = 'exprsn.io';

function log(msg: string) { console.log(`  ${msg}`); }
function ok(msg: string) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg: string) { console.log(`  \x1b[33m⚠\x1b[0m ${msg}`); }
function step(n: number, title: string) {
  console.log(`\n\x1b[36m━━━ Phase ${n}: ${title} ━━━\x1b[0m`);
}

async function count(table: string): Promise<number> {
  const result = await db.execute(sql.raw(`SELECT count(*)::int as cnt FROM ${table}`));
  return (result as any)[0]?.cnt ?? 0;
}


async function main() {
  console.log('\n\x1b[1m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║   Database Cleanup — Keep rickholland     ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════╝\x1b[0m');

  // ── Find IDs of things to keep ──
  log('Finding Exprsn.io organization...');
  const orgs = await db.execute(
    sql`SELECT id FROM organizations WHERE owner_did = ${KEEP_DID} AND name = ${KEEP_ORG_NAME} LIMIT 1`
  );
  const keepOrgId = (orgs as any)[0]?.id;
  if (!keepOrgId) {
    warn(`Organization "${KEEP_ORG_NAME}" not found — will delete ALL orgs`);
  } else {
    ok(`Found org: ${keepOrgId}`);
  }

  log('Finding exprsn.io domain...');
  const doms = await db.execute(
    sql`SELECT id FROM domains WHERE domain = ${KEEP_DOMAIN} LIMIT 1`
  );
  const keepDomainId = (doms as any)[0]?.id;
  if (!keepDomainId) {
    warn(`Domain "${KEEP_DOMAIN}" not found — will delete ALL domains`);
  } else {
    ok(`Found domain: ${keepDomainId}`);
  }

  // ══════════════════════════════════════════
  // Phase 1: Tables with non-cascading user FKs
  // ══════════════════════════════════════════
  step(1, 'Delete non-cascading user-referenced data');

  // contentReports.reporterDid references users.did without CASCADE
  await db.execute(sql.raw(
    `DELETE FROM content_reports WHERE reporter_did != '${KEEP_DID}'`
  ));
  ok('Cleaned content_reports');

  // moderationActions references adminUsers.id (which cascades from users), but also contentReports
  await db.execute(sql.raw(`DELETE FROM moderation_actions`));
  ok('Cleaned moderation_actions');

  // userSanctions references users.did without CASCADE
  await db.execute(sql.raw(
    `DELETE FROM user_sanctions WHERE user_did != '${KEEP_DID}'`
  ));
  ok('Cleaned user_sanctions');

  // featuredContent references adminUsers.id
  await db.execute(sql.raw(`DELETE FROM featured_content`));
  ok('Cleaned featured_content');

  // adminAuditLog references adminUsers.id
  await db.execute(sql.raw(`DELETE FROM admin_audit_log`));
  ok('Cleaned admin_audit_log');

  // adminPermissionAudit references adminUsers.id
  await db.execute(sql.raw(`DELETE FROM admin_permission_audit`));
  ok('Cleaned admin_permission_audit');

  // adminSessions references adminUsers.id
  await db.execute(sql.raw(`DELETE FROM admin_sessions`));
  ok('Cleaned admin_sessions');

  // organizationActivity.actorDid references users.did without CASCADE
  await db.execute(sql.raw(
    `DELETE FROM organization_activity WHERE actor_did != '${KEEP_DID}'`
  ));
  ok('Cleaned organization_activity');

  // organizationTags.createdBy references users.did (nullable, no CASCADE)
  await db.execute(sql.raw(
    `DELETE FROM organization_member_tags`
  ));
  ok('Cleaned organization_member_tags');

  await db.execute(sql.raw(
    `DELETE FROM organization_tags WHERE created_by IS NOT NULL AND created_by != '${KEEP_DID}'`
  ));
  ok('Cleaned organization_tags (non-rickholland)');

  // organizationBlockedWords.createdBy references users.did (nullable, no CASCADE)
  await db.execute(sql.raw(
    `DELETE FROM organization_blocked_words WHERE created_by IS NOT NULL AND created_by != '${KEEP_DID}'`
  ));
  ok('Cleaned organization_blocked_words');

  // bulkImportJobs.createdBy references users.did without CASCADE
  await db.execute(sql.raw(
    `DELETE FROM bulk_import_jobs WHERE created_by != '${KEEP_DID}'`
  ));
  ok('Cleaned bulk_import_jobs');

  // organizationInvites.invitedBy references users.did without CASCADE
  await db.execute(sql.raw(`DELETE FROM organization_invites`));
  ok('Cleaned organization_invites');

  // organizationContentQueue.submittedBy / reviewedBy reference users.did without CASCADE
  await db.execute(sql.raw(`DELETE FROM organization_content_queue`));
  ok('Cleaned organization_content_queue');

  // ca_entity_certificates.subjectDid references users.did without CASCADE
  // Must nullify subject_did for non-rickholland certs before deleting users
  await db.execute(sql.raw(
    `UPDATE ca_entity_certificates SET subject_did = NULL WHERE subject_did IS NOT NULL AND subject_did != '${KEEP_DID}'`
  ));
  ok('Nullified ca_entity_certificates.subject_did for non-rickholland');

  // domain_invites.invited_by references users.did without CASCADE
  await db.execute(sql.raw(`DELETE FROM domain_invites`));
  ok('Cleaned domain_invites');

  // domainActivityLog.actorDid references users.did without CASCADE
  await db.execute(sql.raw(
    `DELETE FROM domain_activity_log WHERE actor_did != '${KEEP_DID}'`
  ));
  ok('Cleaned domain_activity_log');

  // streamModerators.addedBy, streamBannedUsers.bannedBy reference users without CASCADE
  await db.execute(sql.raw(`DELETE FROM stream_guest_sessions`));
  await db.execute(sql.raw(`DELETE FROM stream_guests`));
  await db.execute(sql.raw(`DELETE FROM stream_guest_invitations`));
  await db.execute(sql.raw(`DELETE FROM stream_banned_users`));
  await db.execute(sql.raw(`DELETE FROM stream_moderators`));
  await db.execute(sql.raw(`DELETE FROM stream_viewers`));
  ok('Cleaned stream moderation/guest tables');

  // watchPartyQueue.addedBy references users.did without CASCADE
  await db.execute(sql.raw(`DELETE FROM watch_party_queue`));
  await db.execute(sql.raw(`DELETE FROM watch_party_messages`));
  await db.execute(sql.raw(`DELETE FROM watch_party_participants`));
  await db.execute(sql.raw(`DELETE FROM watch_parties`));
  ok('Cleaned watch party tables');

  // editorComments.resolvedByDid references users.did with SET NULL
  // Clean editor tables before user deletion
  await db.execute(sql.raw(`DELETE FROM editor_comment_reactions`));
  await db.execute(sql.raw(`DELETE FROM editor_comments`));
  await db.execute(sql.raw(`DELETE FROM editor_transitions`));
  await db.execute(sql.raw(`DELETE FROM editor_clips`));
  await db.execute(sql.raw(`DELETE FROM editor_tracks`));
  await db.execute(sql.raw(`DELETE FROM editor_project_history`));
  await db.execute(sql.raw(`DELETE FROM editor_document_snapshots`));
  await db.execute(sql.raw(`DELETE FROM editor_collaborators`));
  ok('Cleaned editor collaboration tables');

  // scheduledPublishing references renderJobs with SET NULL
  await db.execute(sql.raw(`DELETE FROM scheduled_publishing`));
  ok('Cleaned scheduled_publishing');

  // GPU and render worker tables (no user FK, but clean them)
  await db.execute(sql.raw(`DELETE FROM gpu_allocations`));
  await db.execute(sql.raw(`DELETE FROM gpu_metrics`));
  await db.execute(sql.raw(`DELETE FROM render_jobs`));
  await db.execute(sql.raw(`DELETE FROM render_batches`));
  ok('Cleaned render/GPU tables');

  // paymentTransactions references users with plain FK (no CASCADE)
  await db.execute(sql.raw(`DELETE FROM payment_transactions`));
  ok('Cleaned payment_transactions');

  // challenges.createdBy references adminUsers.id (no CASCADE on admin→challenge)
  // challengeEntries/challengeParticipation CASCADE from challenges and users
  try {
    await db.execute(sql.raw(`DELETE FROM challenge_participation`));
    await db.execute(sql.raw(`DELETE FROM challenge_entries`));
    await db.execute(sql.raw(`DELETE FROM challenges`));
    ok('Cleaned challenge tables');
  } catch {
    warn('Challenge tables may not exist, skipping');
  }

  // domainTransfers references organizations without CASCADE in some FKs
  await db.execute(sql.raw(`DELETE FROM domain_transfers`));
  ok('Cleaned domain_transfers');

  // Moderation system tables (no user FK cascades, generic string refs)
  await db.execute(sql.raw(`DELETE FROM moderation_agent_executions`));
  await db.execute(sql.raw(`DELETE FROM moderation_review_queue`));
  await db.execute(sql.raw(`DELETE FROM mod_actions_log`));
  await db.execute(sql.raw(`DELETE FROM appeal_info_requests`));
  await db.execute(sql.raw(`DELETE FROM appeal_history`));
  await db.execute(sql.raw(`DELETE FROM moderation_appeals`));
  await db.execute(sql.raw(`DELETE FROM moderation_user_actions`));
  await db.execute(sql.raw(`DELETE FROM moderation_reports`));
  await db.execute(sql.raw(`DELETE FROM moderation_items`));
  ok('Cleaned moderation system tables');

  // Announcements, payout requests (generic text refs, not FK)
  await db.execute(sql.raw(`DELETE FROM announcements`));
  await db.execute(sql.raw(`DELETE FROM payout_requests WHERE user_did != '${KEEP_DID}'`));
  ok('Cleaned announcements & payout_requests');

  // PLC operations, audit (generic did text, not FK)
  await db.execute(sql.raw(
    `DELETE FROM plc_operations WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  await db.execute(sql.raw(
    `DELETE FROM plc_audit_log WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  ok('Cleaned PLC operations/audit');

  // Handle reservations
  await db.execute(sql.raw(`DELETE FROM plc_handle_reservations`));
  ok('Cleaned PLC handle reservations');

  // ══════════════════════════════════════════
  // Phase 2: Delete organizations (except Exprsn.io)
  // ══════════════════════════════════════════
  step(2, 'Delete non-Exprsn.io organizations');

  if (keepOrgId) {
    // Clean org intermediate CAs for other orgs first (CASCADE should handle, but be safe)
    await db.execute(sql.raw(
      `DELETE FROM organization_intermediate_cas WHERE organization_id != '${keepOrgId}'`
    ));

    // exprsnDidCertificates.organizationId is SET NULL, so nullify for deleted orgs
    await db.execute(sql.raw(
      `UPDATE exprsn_did_certificates SET organization_id = NULL WHERE organization_id IS NOT NULL AND organization_id != '${keepOrgId}'`
    ));

    // Delete non-kept organizations — CASCADE handles:
    // organization_members, organization_roles, organization_tags, organization_member_tags,
    // organization_blocked_words, organization_activity, organization_follows,
    // organization_invites, organization_billing, organization_content_queue
    await db.execute(sql.raw(
      `DELETE FROM organizations WHERE id != '${keepOrgId}'`
    ));
    ok('Deleted non-Exprsn.io organizations (cascaded children)');
  } else {
    warn('No Exprsn.io org found — skipping org cleanup');
  }

  // ══════════════════════════════════════════
  // Phase 3: Delete domains (except exprsn.io)
  // ══════════════════════════════════════════
  step(3, 'Delete non-exprsn.io domains');

  if (keepDomainId) {
    // domainSsoConfig, domainOAuthProviders, domainMfaSettings, domainModerators
    // reference domains but may not cascade — clean explicitly
    try {
      await db.execute(sql.raw(`DELETE FROM domain_sso_config WHERE domain_id != '${keepDomainId}'`));
      await db.execute(sql.raw(`DELETE FROM domain_oauth_providers WHERE domain_id != '${keepDomainId}'`));
      await db.execute(sql.raw(`DELETE FROM domain_mfa_settings WHERE domain_id != '${keepDomainId}'`));
      await db.execute(sql.raw(`DELETE FROM domain_moderators WHERE domain_id != '${keepDomainId}'`));
    } catch {
      warn('Some domain auth tables may not exist');
    }

    // invite_codes.domainId references domains with CASCADE
    await db.execute(sql.raw(
      `DELETE FROM invite_codes WHERE domain_id IS NOT NULL AND domain_id != '${keepDomainId}'`
    ));

    // Delete non-kept domains — CASCADE handles:
    // domain_users, domain_invites, domain_groups, domain_group_members,
    // domain_roles, domain_user_roles, domain_group_roles, domain_activity_log,
    // domain_transfers, domain_clusters, domain_services, domain_banned_words,
    // domain_banned_tags, domain_moderation_queue, moderation_policies,
    // word_filters, shadow_bans, domain_moderation_config, domain_identities,
    // domain_handle_reservations, domain_dns_records, domain_health_checks,
    // domain_health_summaries, themes
    await db.execute(sql.raw(
      `DELETE FROM domains WHERE id != '${keepDomainId}'`
    ));
    ok('Deleted non-exprsn.io domains (cascaded children)');
  } else {
    warn('No exprsn.io domain found — skipping domain cleanup');
  }

  // ══════════════════════════════════════════
  // Phase 4: Delete users (except rickholland)
  // ══════════════════════════════════════════
  step(4, 'Delete non-rickholland users');

  // Clean upload_jobs (userDid is plain text, no FK CASCADE)
  await db.execute(sql.raw(
    `DELETE FROM upload_jobs WHERE user_did != '${KEEP_DID}'`
  ));
  ok('Cleaned upload_jobs');

  // Clean user_interactions (userDid is plain text, no FK)
  await db.execute(sql.raw(
    `DELETE FROM user_interactions WHERE user_did != '${KEEP_DID}'`
  ));
  ok('Cleaned user_interactions');

  // Delete non-kept users — CASCADE handles:
  // videos, likes, comments, comment_reactions, video_reactions, follows,
  // bookmarks, reposts, shares, duets, stitches, blocks, mutes,
  // conversations (participant1/2), messages, message_reactions, message_attachments,
  // conversation_participants, user_presence, notifications, notification_seen_at,
  // notification_subscriptions, user_preferences, user_settings,
  // lists, list_items, live_streams (→ stream_chat etc.), stream_webhooks,
  // editor_projects (→ clips, tracks, etc.), editor_effect_presets, editor_assets, editor_templates,
  // render_jobs, render_batches, user_render_quotas, scheduled_publishing,
  // payment_configs (→ payment_customers, payment_methods), creator_earnings,
  // creator_subscription_tiers (→ creator_subscriptions), creator_fund_payouts,
  // creator_fund_eligibility, notification_settings, notification_log, push_tokens,
  // render_presets, watch_parties, sound_usage_history,
  // admin_users (→ admin_permission_audit, admin_sessions, admin_audit_log),
  // hashtag_follows, tips, user_feed_preferences, organization_follows,
  // video_views (viewerDid not FK, but videos cascade), invite_codes (issuerDid CASCADE)
  await db.execute(sql.raw(
    `DELETE FROM users WHERE did != '${KEEP_DID}'`
  ));
  ok('Deleted non-rickholland users (cascaded all content)');

  // ══════════════════════════════════════════
  // Phase 5: Clean up orphans and service data
  // ══════════════════════════════════════════
  step(5, 'Clean orphaned/ancillary data');

  // Clean actorRepos for non-kept accounts (not FK-cascaded from users)
  await db.execute(sql.raw(
    `DELETE FROM actor_repos WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  ok('Cleaned actor_repos (kept rickholland + prefetch-worker)');

  // Sessions for deleted actorRepos (CASCADE from actor_repos handles this, but be safe)
  await db.execute(sql.raw(
    `DELETE FROM sessions WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  ok('Cleaned orphan sessions');

  // Repo data for deleted actors
  await db.execute(sql.raw(
    `DELETE FROM repo_records WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  await db.execute(sql.raw(
    `DELETE FROM repo_commits WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  await db.execute(sql.raw(
    `DELETE FROM repo_blocks WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  await db.execute(sql.raw(
    `DELETE FROM blobs WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  ok('Cleaned repo_records, repo_commits, repo_blocks, blobs');

  // PLC identities for non-kept DIDs
  await db.execute(sql.raw(
    `DELETE FROM plc_identities WHERE did NOT IN ('${KEEP_DID}', '${KEEP_SERVICE_DID}')`
  ));
  ok('Cleaned plc_identities');

  // Clean non-FK user tables (plain text user references, no CASCADE)
  await db.execute(sql.raw(
    `DELETE FROM user_content_feedback WHERE user_did != '${KEEP_DID}'`
  ));
  await db.execute(sql.raw(
    `DELETE FROM user_feed_preferences WHERE user_did != '${KEEP_DID}'`
  ));
  await db.execute(sql.raw(
    `DELETE FROM api_tokens WHERE owner_did != '${KEEP_DID}'`
  ));
  await db.execute(sql.raw(
    `DELETE FROM domain_moderators WHERE user_did != '${KEEP_DID}'`
  ));
  ok('Cleaned non-FK user tables (content_feedback, feed_prefs, api_tokens, domain_moderators)');

  // Clean trending/cached data
  await db.execute(sql.raw(`DELETE FROM trending_videos`));
  await db.execute(sql.raw(`DELETE FROM trending_hashtags`));
  await db.execute(sql.raw(`DELETE FROM trending_sounds`));
  await db.execute(sql.raw(`DELETE FROM sound_usage_history`));
  await db.execute(sql.raw(`DELETE FROM video_embeddings`));
  await db.execute(sql.raw(`DELETE FROM video_hashtags`));
  await db.execute(sql.raw(`DELETE FROM analytics_snapshots`));
  await db.execute(sql.raw(`DELETE FROM hashtags`));
  await db.execute(sql.raw(`DELETE FROM sounds`));
  ok('Cleaned trending/analytics/hashtags/sounds cache data');

  // Clean DID cache (can be re-populated)
  await db.execute(sql.raw(`DELETE FROM did_cache`));
  ok('Cleaned DID cache');

  // Clean relay data
  await db.execute(sql.raw(`DELETE FROM relay_events`));
  await db.execute(sql.raw(`DELETE FROM relay_subscribers`));
  await db.execute(sql.raw(`DELETE FROM federation_sync_state`));
  ok('Cleaned relay/federation data');

  // Clean render workers (infrastructure, not user data)
  await db.execute(sql.raw(`DELETE FROM render_workers`));
  ok('Cleaned render_workers');

  // Clean orphan invite codes (user CASCADE should have handled, but be safe)
  await db.execute(sql.raw(
    `DELETE FROM invite_codes WHERE issuer_did != '${KEEP_DID}'`
  ));
  ok('Cleaned invite_codes');

  // Reset rickholland's counts to accurate values
  await db.execute(sql`
    UPDATE users SET
      follower_count = (SELECT count(*) FROM follows WHERE followee_did = ${KEEP_DID}),
      following_count = (SELECT count(*) FROM follows WHERE follower_did = ${KEEP_DID}),
      video_count = (SELECT count(*) FROM videos WHERE author_did = ${KEEP_DID} AND deleted_at IS NULL)
    WHERE did = ${KEEP_DID}
  `);
  ok('Reset rickholland follower/following/video counts');

  // Reset Exprsn.io org counts
  if (keepOrgId) {
    await db.execute(sql`
      UPDATE organizations SET
        member_count = (SELECT count(*) FROM organization_members WHERE organization_id = ${keepOrgId}),
        follower_count = (SELECT count(*) FROM organization_follows WHERE organization_id = ${keepOrgId}),
        video_count = 0
      WHERE id = ${keepOrgId}
    `);
    ok('Reset Exprsn.io org counts');
  }

  // ══════════════════════════════════════════
  // Phase 6: Summary
  // ══════════════════════════════════════════
  step(6, 'Verification Summary');

  const tables = [
    'users', 'actor_repos', 'sessions', 'admin_users',
    'organizations', 'organization_members', 'domains',
    'videos', 'likes', 'comments', 'follows',
    'conversations', 'messages', 'notifications',
    'live_streams', 'plc_identities',
    'ca_root_certificates', 'ca_intermediate_certificates', 'ca_entity_certificates',
    'exprsn_did_certificates',
  ];

  console.log('\n  \x1b[1mRemaining row counts:\x1b[0m');
  for (const table of tables) {
    try {
      const cnt = await count(table);
      console.log(`    ${table.padEnd(35)} ${cnt}`);
    } catch {
      console.log(`    ${table.padEnd(35)} (table not found)`);
    }
  }

  // Verify key records
  console.log('\n  \x1b[1mKey records:\x1b[0m');

  const userCheck = await db.execute(sql`SELECT did, handle FROM users WHERE did = ${KEEP_DID}`);
  if ((userCheck as any)[0]) {
    ok(`User: ${(userCheck as any)[0].handle} (${(userCheck as any)[0].did})`);
  } else {
    warn('rickholland user NOT FOUND!');
  }

  if (keepOrgId) {
    const orgCheck = await db.execute(sql`SELECT id, name FROM organizations WHERE id = ${keepOrgId}`);
    if ((orgCheck as any)[0]) {
      ok(`Organization: ${(orgCheck as any)[0].name} (${(orgCheck as any)[0].id})`);
    } else {
      warn('Exprsn.io organization NOT FOUND!');
    }
  }

  if (keepDomainId) {
    const domCheck = await db.execute(sql`SELECT id, domain FROM domains WHERE id = ${keepDomainId}`);
    if ((domCheck as any)[0]) {
      ok(`Domain: ${(domCheck as any)[0].domain} (${(domCheck as any)[0].id})`);
    } else {
      warn('exprsn.io domain NOT FOUND!');
    }
  }

  const serviceCheck = await db.execute(sql`SELECT did FROM actor_repos WHERE did = ${KEEP_SERVICE_DID}`);
  if ((serviceCheck as any)[0]) {
    ok(`Service account: ${KEEP_SERVICE_DID}`);
  } else {
    warn('prefetch-worker service account NOT FOUND');
  }

  console.log('\n\x1b[1m══════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m  Cleanup Complete\x1b[0m');
  console.log('\x1b[1m══════════════════════════════════════════\x1b[0m\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\n\x1b[31m✗ Cleanup failed:\x1b[0m', err);
  process.exit(1);
});
