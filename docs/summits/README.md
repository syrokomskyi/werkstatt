# Design Summit Reports

This directory contains multi-persona design summit reports produced by the `fo-design-summit` skill.

## Purpose

Design summit reports are informational artifacts that capture a multi-perspective review of complex RFCs. Each report simulates five professional perspectives — Architect, Security Engineer, QA Engineer, Product Manager, and Developer Advocate — to surface issues that a single-perspective review might miss.

## How summit reports are created

Summit reports are created by the `fo-design-summit` skill, which is invoked manually by the operator or suggested by `fo-idea-plan` for RFCs that meet complexity criteria.

## Important notes

- Summit reports are **informational artifacts**, not governance documents.
- Summit reports **do not block RFC acceptance** — the operator decides whether to act on their findings.
- Summit findings that warrant RFC changes should be routed through `fo-idea-enhance` as audit-style findings.
- A summit report with no findings does not mean no issues — it means no issues were found from the five reviewed perspectives.
