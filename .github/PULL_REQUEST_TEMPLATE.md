name: Pull Request
description: Change request. Must link exactly one GitHub Issue and pass the Definition of Done.
title: "[OPN-###] Short summary"
labels: ["triage"]
body:
  - type: input
    id: issue
    attributes:
      label: Linked Issue
      description: The single GitHub Issue this PR addresses (required by AGENTS.md).
      placeholder: "OPN-42"
    validations:
      required: true

  - type: dropdown
    id: dod
    attributes:
      label: Definition of Done
      description: Confirm you self-reviewed against docs/DEFINITION_OF_DONE.md.
      options:
        - "Yes — all DoD gates pass"
        - "No — this PR is a draft / blocked"
    validations:
      required: true

  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What changed and why.
    validations:
      required: true

  - type: textarea
    id: changes
    attributes:
      label: Changes
      description: Files touched and the approach taken.
      placeholder: |
        - src/uploader.js: added retry/backoff
        - docs/ARCHITECTURE.md: documented adapter contract
    validations:
      required: true

  - type: textarea
    id: testing
    attributes:
      label: Testing & Verification
      description: npm run lint result, tests run, manual steps.
    validations:
      required: true

  - type: textarea
    id: docs
    attributes:
      label: Documentation Updated
      description: ARCHITECTURE.md / README.md / process docs changed in this PR?
    validations:
      required: true

  - type: textarea
    id: risks
    attributes:
      label: Risks / Rollout
      description: Breaking changes, migrations, follow-up issues.
