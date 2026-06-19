# Supervised Content Run 002

## Summary

This case study describes a public-safe supervised content MVP run from an
internal portal automation project. The goal was to verify whether the full
human-gated content workflow could complete for one manually approved post.

The public version is sanitized. It does not include real profile URLs, post
text, logs, private CSV contents, account data, secrets, API keys, local config,
or browser state.

## Flow Tested

The run completed the full supervised path:

- campaign review,
- AI draft generation,
- manual approval,
- approval review,
- publish plan,
- browser dry-run,
- manual publish,
- manual portal verification,
- audit review.

## Result

One real post was published successfully.

The browser dry-run worked first and did not publish anything. Real publishing
then required two explicit operator confirmations:

```text
PUBLISH_CONTENT_YES
FINAL_PUBLISH_YES
```

The safe publish result summary was:

```text
publish_success = 1
publish_failed = 0
unknown_result = 0
```

The operator later verified that the Dutch language quality was acceptable.

## Safety Boundaries

This run did not change the safety model:

- approval stayed manual,
- browser dry-run stayed read-only,
- real publish still required two confirmations,
- the publication limit stayed max 1 post per run,
- no scheduler was added,
- no API server was added,
- no GUI was added,
- no full automation was added.

## Limitation

This proves supervised MVP usability for one manually approved post. It does
not prove scale readiness.

Scaling remains blocked until there is more language-quality confidence and more
audit history. The AI draft also still produced blank paragraph spacing inside
`draft_text`, so draft formatting remains part of manual review.

## Outcome

The supervised content MVP reached a practical milestone: one manually approved
AI-assisted post moved through planning, dry-run, guarded publishing, portal
verification, and audit review without increasing automation scope.

## Reusable Lesson

A successful one-post supervised run is useful evidence, but scale should wait
until language review and audit history are stronger.
