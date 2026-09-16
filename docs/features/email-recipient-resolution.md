# Email Recipient Resolution

Some inbound emails are automated notifications that _forward_ an enquiry
from a third party — a lead-generation platform, a website contact-form
relay, a classifieds site alerting a dealer about a buyer, etc. The
notification's own `From`/`Reply-To` is the platform, but the actual person
who should receive the reply is only named inside the email body (a
`mailto:` link, a "reply to this person" button, a plain-text address next
to their name).

By default, LLM Crafter replies to whoever sent the email
(`Reply-To`, falling back to `From`) — the correct behavior for normal
correspondence, but wrong for this "forwarded enquiry" case: the reply would
go back to the platform instead of the person who asked the question.

This is compounded by the fact that these notification senders are very
often themselves a `no-reply@`/`do-not-reply@` address. Email triage
normally drops those outright (see
[Loop protection](email-agents.md#7-loop-protection)) — so simply enabling
recipient resolution isn't enough on its own. Triage lets a no-reply sender
through to classification specifically when `recipient_resolution.enabled`
is true for the mailbox; true bounce senders (`mailer-daemon`, `postmaster`,
`bounce@`) are still always dropped regardless.

**Recipient resolution** detects this situation and, when confident enough,
redirects the reply to the address found in the body instead. It is fully
opt-in and configured per `MailAccount` — there is nothing platform-specific
in the code; it works from the structure of the email itself.

---

## How it works

Two stages, run by `emailRecipientResolverService`:

1. **Free candidate extraction (Stage 1 — no tokens spent).**
   The service scans the email for `mailto:` links (and, optionally, plain
   email-shaped text) and builds a list of candidate addresses, discarding:

   - the sender/`Reply-To` address itself (nothing to resolve)
   - the mailbox's own addresses (`send_profile.from_email` / `reply_to`)
   - addresses on the same domain as the sender (footer/unsubscribe/system
     addresses on the notification platform's own domain)
   - anything that looks like a no-reply/automated address itself (a
     `mailto:` to another no-reply address is never a useful reply target)

   If this leaves **no candidates**, resolution stops here — the default
   recipient is used and no LLM call is made. This keeps the common case
   (normal 1:1 correspondence) at zero extra cost.

2. **Cheap LLM call (Stage 2 — only when Stage 1 found something).**
   A small structured-output classifier (same cheapest-model tier as email
   triage: `gpt-5.4-nano`, `claude-3-5-haiku`, `gemini-2.0-flash`, ...) is
   given the candidate address(es) and the (truncated) body, and decides
   whether the reply should be redirected, to which address, and with what
   confidence. It never invents an address that isn't present in the text.

The resolved address is only used automatically when its confidence meets
`min_confidence`. Below that, the suggestion is **not** applied silently —
the draft is forced into `human_review` instead, with the suggested address
recorded so a person can confirm or correct it.

---

## Config reference

All fields live under `recipient_resolution` on the `MailAccount`:

```json
{
  "recipient_resolution": {
    "enabled": true,
    "min_confidence": 0.75,
    "require_review_below_threshold": true,
    "custom_prompt": null,
    "extract_plain_text_candidates": false,
    "sender_overrides": [
      {
        "match_domain": "leads.example-platform.com",
        "match_sender": null,
        "force_ai_resolution": true,
        "extract_plain_text_candidates": true,
        "extraction_hint": "The buyer's email appears as plain text under a 'Contact info' heading, not as a mailto: link."
      }
    ]
  }
}
```

| Field                            | Default | Meaning                                                                                                                                                                  |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                        | `false` | Turn the whole feature on for this mailbox.                                                                                                                              |
| `min_confidence`                 | `0.75`  | Confidence required before the resolved address is actually used as `to`.                                                                                                |
| `require_review_below_threshold` | `true`  | When a redirect is found but below `min_confidence`, force `human_review` instead of silently dropping it.                                                               |
| `custom_prompt`                  | `null`  | Free text folded into the resolver's prompt — mailbox-wide guidance.                                                                                                     |
| `extract_plain_text_candidates`  | `false` | Also scan free body text (not just `mailto:` links) for candidate addresses. Off by default — free text is noisy (signatures, quoted history, CC'd addresses all match). |
| `sender_overrides[]`             | `[]`    | Per-sender/domain exceptions — see below.                                                                                                                                |

### `sender_overrides[]`

Each entry matches inbound mail by exact sender or by domain and can
override the defaults just for that sender:

| Field                           | Meaning                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_sender`                  | Exact `From` address to match. Takes precedence over `match_domain`.                                                                                       |
| `match_domain`                  | Domain to match when `match_sender` isn't set.                                                                                                             |
| `force_ai_resolution`           | Run the Stage 2 LLM call even when Stage 1 found **zero** candidates — for platforms that embed the real recipient as plain text with no `mailto:` at all. |
| `extract_plain_text_candidates` | Override plain-text scanning just for this sender.                                                                                                         |
| `extraction_hint`               | Free text describing where/how this platform exposes the real recipient — folded into the prompt.                                                          |

Use `force_ai_resolution` + `extraction_hint` for a platform whose emails
never contain a `mailto:` link for the real recipient — the resolver will
still call the LLM and read the hint to find the address in the body text.

---

## Where the result shows up

- `Conversation` messages: the assistant's email `channel_info.email.reply_to`
  reflects the resolved address (once above threshold).
- `OutboundEmail.to`: set to the resolved address when confident.
- `OutboundEmail.metadata.recipient_resolution`: the full resolver result
  (`to`, `name`, `confidence`, `reasons`) — surfaced in the drafts UI so a
  reviewer can see _why_ the recipient differs from the visible sender.
- `OutboundEmail.reason`: `recipient_redirect_low_confidence` when a
  redirect was found but forced into review for being under threshold.
- `Conversation.metadata.total_cost` / `total_tokens_used`: the resolver's
  LLM call (when it runs) is folded into the conversation's running totals,
  same as triage classification, procedures, and title/summarization —
  none of these produce a visible chat message but all count toward the
  conversation's cost.

---

## Safety notes

- Resolution never runs on a body-derived address that looks like a
  no-reply/automated sender (see [Loop protection](email-agents.md#7-loop-protection))
  — even if the LLM suggests one, it's rejected defensively.
- On any error, resolution fails closed: it returns no redirect and the
  default recipient (`Reply-To`/`From`) is used, same as before this feature
  existed.
- Because a resolved address comes from untrusted email content, treat
  `min_confidence` conservatively and keep `require_review_below_threshold`
  enabled until you've verified a mailbox's traffic pattern.
