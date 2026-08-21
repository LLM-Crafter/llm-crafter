'use strict';

/**
 * Email pipeline bootstrap.
 *
 * Call `start()` once from app.js after the DB connection is established.
 *
 * Behaviour is gated on env vars so individual deployments / replicas can
 * opt in or out:
 *
 *   EMAIL_PIPELINE_ENABLED        - master switch (default: false)
 *   EMAIL_INGEST_WORKER_ENABLED   - run the ingest worker on this replica (default: true when pipeline enabled)
 *   EMAIL_OUTBOUND_WORKER_ENABLED - run the outbound sender on this replica (default: true when pipeline enabled)
 *   EMAIL_IMAP_SCHEDULER_ENABLED  - run the IMAP poller scheduler on this replica (default: true when pipeline enabled)
 *
 *   EMAIL_INGEST_CONCURRENCY      - parallel ingest jobs per replica (default: 3)
 *   EMAIL_OUTBOUND_CONCURRENCY    - parallel outbound sends per replica (default: 1)
 *
 * Keeping each piece individually toggle-able lets you run a dedicated
 * "worker" replica without HTTP, or split workloads across replicas later.
 */

const ingestWorker = require('./workers/ingestWorker');
const outboundWorker = require('./workers/outboundWorker');
const gmailSyncWorker = require('./workers/gmailSyncWorker');
const graphSyncWorker = require('./workers/graphSyncWorker');
const imapPollerScheduler = require('./pollers/imapPollerScheduler');
const gmailWatchScheduler = require('./gmailWatchScheduler');
const microsoftSubscriptionScheduler = require('./microsoftSubscriptionScheduler');

function readBool(name, defaultValue) {
  const v = process.env[name];
  if (v === undefined || v === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function readInt(name, defaultValue) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : defaultValue;
}

function start() {
  if (!readBool('EMAIL_PIPELINE_ENABLED', false)) {
    console.log('[EmailPipeline] disabled (set EMAIL_PIPELINE_ENABLED=true to enable)');
    return;
  }

  console.log('[EmailPipeline] starting');

  if (readBool('EMAIL_INGEST_WORKER_ENABLED', true)) {
    ingestWorker.start({
      concurrency: readInt('EMAIL_INGEST_CONCURRENCY', 3),
    });
  }

  if (readBool('EMAIL_OUTBOUND_WORKER_ENABLED', true)) {
    outboundWorker.start({
      concurrency: readInt('EMAIL_OUTBOUND_CONCURRENCY', 1),
    });
  }

  if (readBool('EMAIL_GMAIL_SYNC_WORKER_ENABLED', true)) {
    gmailSyncWorker.start({
      concurrency: readInt('EMAIL_GMAIL_SYNC_CONCURRENCY', 2),
    });
  }

  if (readBool('EMAIL_GRAPH_SYNC_WORKER_ENABLED', true)) {
    graphSyncWorker.start({
      concurrency: readInt('EMAIL_GRAPH_SYNC_CONCURRENCY', 2),
    });
  }

  if (readBool('EMAIL_IMAP_SCHEDULER_ENABLED', true)) {
    imapPollerScheduler.start();
  }

  if (readBool('EMAIL_GMAIL_WATCH_SCHEDULER_ENABLED', true)) {
    gmailWatchScheduler.start();
  }

  if (readBool('EMAIL_GRAPH_SUBSCRIPTION_SCHEDULER_ENABLED', true)) {
    microsoftSubscriptionScheduler.start();
  }
}

module.exports = { start };
