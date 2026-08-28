---
name: aqg-test
description: Audit and remove worthless tests from a requested directory
disable-model-invocation: true
---

# Test value audit

Audit the tests in the directory passed as the skill argument. Do not inspect or change tests outside that directory unless a dependency must be traced to determine whether an in-scope test has value.

## Goal

Keep tests that exercise meaningful production behavior and can catch a plausible regression. Delete tests that test nothing, together with fixtures, helpers, mocks, setup, production seams, and other code that exists only for those deleted tests.

## What "tests nothing" means

A test is worthless when its passing result provides no meaningful evidence that production behavior works. This includes, but is not limited to:

- serializing or creating JSON in the test and merely asserting that the same JSON parses;
- writing a value to a database or store and merely asserting that the storage library returns that value, without exercising application behavior;
- testing a mocked method with synthetic inputs disconnected from the real production data flow;
- asserting mock configuration, implementation details, constants, language behavior, or third-party library behavior instead of an owned contract;
- reproducing production logic inside the test and comparing the implementation with that reproduction;
- assertions so weak that broken behavior still passes, including existence-only checks and snapshots with no reviewed semantic contract;
- tests that cannot fail from a realistic defect in the code they claim to cover;
- duplicate tests that add no distinct behavior, boundary, failure mode, or integration evidence.

A test has value only when the inspected code and data flow show that it protects an owned behavior, contract, boundary, failure mode, or meaningful integration. Test names, coverage, complexity, and the fact that a test currently passes are not evidence of value.

## Workflow

1. Resolve the argument to one directory. Stop and ask for the directory if it is missing or ambiguous.
2. Count the in-scope test cases before editing. Use the test framework's collected test count when available; otherwise count declared test cases consistently and record the method.
3. Inspect each test from its assertion backward through setup, mocks, fixtures, and the relevant production path. Determine what defect would make the test fail.
4. Keep tests with concrete regression value. Treat uncertain tests as unresolved until the relevant production path has been inspected; do not delete from intuition alone.
5. Delete every worthless test. If a file has no valuable tests left, delete the file.
6. Delete now-unused fixtures, snapshots, helpers, mocks, setup, dependencies, and test-only production hooks created solely for deleted tests. Do not perform unrelated cleanup or refactoring.
7. Run the narrowest relevant test command and repository verification required for the changed files. Fix failures caused by the removals.
8. Count the remaining in-scope test cases using the same method as the initial count. Inspect the diff and verify that no valuable test or shared support was removed accidentally.

## Response

Respond in no more than three short sentences:

`Tests: <before> -> <after>.`

Use the remaining one or two sentences to name the specific worthless patterns removed. Mention verification failure or unresolved uncertainty only if one remains; never claim completion when verification failed.
