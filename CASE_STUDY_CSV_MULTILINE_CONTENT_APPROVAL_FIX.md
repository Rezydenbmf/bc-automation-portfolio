# CSV Multiline Content Approval Fix

## Summary

This case study describes a small, supervised automation fix from an internal
content approval workflow. The original workflow used CSV files to move one
approved content record through review, planning, and a manual publish step.

The public version is sanitized. It does not include portal URLs, account data,
approved post text, logs, private CSV files, secrets, or client identifiers.

## Problem

A manually approved content field, `approved_text`, could contain blank lines,
commas, quotes, and URLs. One part of the workflow parsed CSV by splitting the
file into physical lines first.

That approach is unsafe for valid CSV, because a quoted field can legally
contain newline characters. When that happened, one approved text field could be
treated as several rows.

## Impact

The bug could cause two visible problems:

- `approved_title` could be detached from the approved record and lost before
  the publish plan.
- A piece of multiline `approved_text` could become an extra invalid record.

For an operator, this meant the approval CSV could look correct, but the publish
plan and manual publish safety summary could show missing title metadata.

## Fix

The workflow was changed to use a shared CSV reader that understands quoted
multiline fields. Newline characters now end a CSV record only when the parser
is outside quoted text. Quoted commas, doubled quotes, URLs, and blank lines stay
inside the same field.

The same shared reader is used across the approval review, publish plan, browser
dry-run input, and manual publish input. Existing CSV writing continues to quote
fields so multiline values are preserved between steps.

## Safety Boundaries

The fix did not loosen the publishing workflow:

- human approval remained required,
- only approved review rows could enter the publish plan,
- manual confirmation remained required before browser action,
- final confirmation remained required before submit,
- publish limits stayed unchanged,
- no scheduler, API server, GUI, or scale automation was added.

## Verification

Regression tests covered:

- multiline `approved_text` with a blank line,
- `approved_text` with a URL,
- preservation of `approved_title` into the publish plan,
- no extra invalid row created from multiline text,
- manual publish input reading one multiline plan row as one record.

A small post-fix control run then verified the operator-facing path:

- approval review read 1 record and found 1 approved valid record,
- publish plan read 1 record, planned 1 record, and found 0 invalid records,
- `approved_title` reached the publish plan,
- manual publish summary reported `title_present=true`,
- manual publish summary reported `title_length=40`,
- the real portal post was manually confirmed as visible.

## Limitation

The control run was not a clean automation success. The terminal result still
showed a final confirmation/result mismatch, and the operator reported a
transient login or server issue on the first attempt.

Because of that, the scale recommendation stayed blocked:

```text
investigate_before_scaling
```

## Outcome

The CSV/title fix was verified for the approval-to-plan-to-manual-publish
metadata path. Scaling remained blocked until final confirmation handling is
investigated and/or another clean manual publish verification run passes.

## Reusable Lesson

Never parse CSV with simple line splitting when fields can contain newlines,
commas, quotes, or URLs.
