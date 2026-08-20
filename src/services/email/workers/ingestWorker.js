'use strict';

/**
 * IngestWorker — consumes jobs from the `email.ingest` queue.
 *
 * Job payload:
 *   {
 *     mail_account_id: string,
 *     external_id: string,                  // provider-specific id (e.g. "uidvalidity:uid")
 *     raw_base64: string,                   // raw RFC822 bytes
 *     envelope_message_id?: string,
 *     envelope_from?: string,
 *     envelope_subject?: string,
 *     provider_message_id?: string,
 *     provider_thread_id?: string
 *   }
 *
 * Flow per job:
 *   1. Insert a `ProcessedEmail` row keyed by (mail_account, external_id).
 *      Unique index guarantees idempotency — any duplicate insertion fails
 *      with E11000 and we return immediately (no LLM call).
 *   2. Parse raw bytes with mailparser.
 *   3. Hand off to EmailAgentService.processIncomingEmail.
 *
 * Multi-instance: the queue's atomic claim + the idempotency index together
 * guarantee that each message is processed at most once even with many
 * worker replicas.
 */

const ProcessedEmail = require('../../../models/ProcessedEmail');
const jobQueue = require('../../jobQueueService');
const emailParser = require('../emailParser');
const emailAgentService = require('../emailAgentService');

const QUEUE_NAME = 'email.ingest';

async function handleIngestJob(payload, job) {
  const {
    mail_account_id,
    external_id,
    raw_base64,
    envelope_message_id,
    envelope_from,
    envelope_subject,
    provider_message_id,
    provider_thread_id,
  } = payload;

  if (!mail_account_id || !external_id || !raw_base64) {
    throw new Error('Invalid ingest payload: missing required fields');
  }

  console.log(
    `[IngestWorker] processing job=${job._id} account=${mail_account_id} external_id=${external_id} subject="${envelope_subject || '(unknown)'}" from=${envelope_from || '(unknown)'}`
  );

  // ── 1. Idempotency row ────────────────────────────────────────────────
  // Use findOneAndUpdate(upsert) instead of create so that a row left in
  // 'pending' by a previously crashed worker (e.g. Ctrl+C) is re-used rather
  // than triggering E11000 and silently dropping the message forever.
  // Any row that already reached a terminal outcome is a true duplicate —
  // we skip those.
  const processedEmail = await ProcessedEmail.findOneAndUpdate(
    { mail_account: mail_account_id, external_id },
    {
      $setOnInsert: {
        mail_account: mail_account_id,
        external_id,
        message_id: envelope_message_id || null,
        from_email: envelope_from || null,
        subject: envelope_subject || null,
        outcome: 'pending',
      },
    },
    { upsert: true, new: true }
  );

  if (processedEmail.outcome !== 'pending') {
    // Already fully handled by a previous (successful) worker run.
    console.log(
      `[IngestWorker] already processed external_id=${external_id} outcome=${processedEmail.outcome} — skipping`
    );
    return;
  }

  // ── 2. Parse ───────────────────────────────────────────────────────────
  let email;
  try {
    const raw = Buffer.from(raw_base64, 'base64');
    email = await emailParser.parseRaw(raw);
    console.log(
      `[IngestWorker] parsed job=${job._id} raw_bytes=${raw.length} body_text_len=${email.body_text?.length ?? 0} body_html_len=${email.body_html?.length ?? 0} attachments=${email.attachments?.length ?? 0}`
    );
  } catch (e) {
    await ProcessedEmail.updateOne(
      { _id: processedEmail._id },
      { $set: { outcome: 'failed', error: `parse: ${e.message}` } }
    );
    throw e;
  }

  // ── 3. Orchestrator ────────────────────────────────────────────────────
  const result = await emailAgentService.processIncomingEmail({
    mailAccountId: mail_account_id,
    email,
    processedEmail,
    providerMessageId:
      provider_message_id || job.context?.provider_message_id || null,
    providerThreadId:
      provider_thread_id || job.context?.provider_thread_id || null,
  });

  console.log(
    `[IngestWorker] done job=${job._id} external_id=${external_id} status=${result?.status} outbound_state=${result?.outbound_state ?? 'n/a'}`
  );
}

function start({ concurrency = 3 } = {}) {
  return jobQueue.runWorker(QUEUE_NAME, handleIngestJob, {
    concurrency,
    pollIntervalMs: 2000,
  });
}

module.exports = { start, QUEUE_NAME, handleIngestJob };
