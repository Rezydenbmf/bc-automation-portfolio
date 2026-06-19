# AI Content Quality Gate For A Supervised Campaign MVP

## Summary

This case study describes a public-safe update from an internal supervised
content workflow. The project moved from testing whether the technical flow
worked to checking whether AI-generated content was useful enough for a small,
manually supervised campaign.

The public version is sanitized. It does not include logs, private CSV files,
portal URLs, account data, generated post text, secrets, API keys, local config,
or private implementation details.

## Context

The workflow already had safety gates for AI-assisted content preparation:

- AI drafts were generated before runtime publishing,
- approval remained manual,
- only approved rows could move into a publish plan,
- browser automation required a separate confirmation,
- real publish required two confirmations,
- the real publication limit stayed at max 1 publication per run.

This stage focused on content quality, not on increasing automation.

## Test Setup

A small synthetic campaign was used:

- 5 synthetic campaign records were reviewed,
- 5 AI drafts were generated,
- no real profile URLs were used in public documentation,
- no account data or published post content was included,
- browser automation was not run,
- real publish was not run.

## What Was Checked

Each draft was reviewed for practical campaign usefulness:

- profile fit,
- industry fit,
- country and language fit,
- natural tone,
- non-spammy wording,
- usefulness of the title,
- suitability for manual approval.

## Finding

The first draft set was technically valid, but not every draft was good enough
for approval. Some text was too broad, too formal, or had titles that felt more
like long SEO phrases than natural post titles.

A narrow prompt improvement was made instead of redesigning the system:

- prefer concise practical titles,
- avoid unsupported first-person claims,
- keep posts to one or two short paragraphs.

## Result

After the narrow improvement:

- 5 drafts were generated,
- 3 drafts were considered usable for supervised approval,
- 2 drafts required changes,
- weaker drafts stayed out of the publish plan,
- approval remained manual,
- browser automation was not run,
- real publish was not run,
- publish limits were not increased.

## Safety Boundaries

This update did not add:

- scheduler,
- API server,
- GUI,
- full automation,
- automatic approval,
- automatic publishing,
- higher publish limits.

The publication limit remained max 1 publication per run, and real publishing
still required explicit operator confirmation.

## Outcome

The MVP gained a practical content quality gate before supervised publishing.
Instead of treating every generated draft as ready, the workflow now has a clear
operator pattern: approve only usable drafts, mark weaker drafts as requiring
changes, and keep manual publishing limits unchanged.

## Reusable Lesson

For supervised AI content workflows, generation success is not enough. A useful
MVP needs a quality gate that can reject or hold back weak drafts before they
reach publishing steps.
