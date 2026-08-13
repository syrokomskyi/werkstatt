#!/bin/bash
# Windsurf pre_user_prompt hook: session-end protocol enforcement + dirty-tree guard.
#
# 1. Scans the user's prompt for session-end trigger phrases. If found, blocks
#    the prompt (exit 2) and injects a stderr message that the agent sees,
#    forcing it to invoke fo-session-retro before producing any output.
# 2. On session-end, also runs check-clean-trees.sh and includes dirty-tree
#    warnings in the blocked message so the agent commits before closing.
#
# JSON payload on stdin:
#   { agent_action_name, trajectory_id, execution_id, timestamp, tool_info: { user_prompt, cwd } }
#
# Exit codes: 0 = pass through, 2 = block (agent sees stderr)

set -euo pipefail

payload="$(cat)"

user_prompt="$(printf '%s' "$payload" | jq -r '.tool_info.user_prompt // empty' 2>/dev/null || true)"

if [ -z "$user_prompt" ]; then
  exit 0
fi

# Session-end trigger phrases (from PREFERENCES.md + fo-session-retro SKILL.md)
session_end_phrases=(
  "Завершаем эту сессию"
  "Завершаем сессию"
  "Заканчиваем сессию"
  "Завершить сессию"
  "End session"
  "Wrap up"
  "Session end"
  "/session-end"
)

matched=""
for phrase in "${session_end_phrases[@]}"; do
  if printf '%s' "$user_prompt" | grep -qiF "$phrase"; then
    matched="$phrase"
    break
  fi
done

if [ -z "$matched" ]; then
  exit 0
fi

# Block the prompt and inject the protocol enforcement message into stderr.
# The agent sees this stderr message instead of the raw user prompt.
cat >&2 <<EOF
SESSION-END PROTOCOL TRIGGERED (matched: "$matched")

The user's original message was:
  > $user_prompt

You MUST invoke the fo-session-retro skill via the skill tool BEFORE producing
any other output. This is a NON-NEGOTIABLE BLOCKED GATE per PREFERENCES.md
§ Session-end protocol.

DO NOT produce a closing summary, "сессия завершена" message, or any ad-hoc
output. The closing block must come from fo-session-retro's report.

Protocol steps:
1. Verify clean working trees — run: bash scripts/check-clean-trees.sh
   If dirty: commit via ecosystem.commit (platform) and/or mission.git.commit (workpiece)
   BEFORE invoking fo-session-retro.
2. Verify RFC implementation status
3. Invoke fo-session-retro via the skill tool
4. The retro skill's report IS the session-end output
EOF

# Run check-clean-trees.sh and append results to stderr if dirty
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -n "$repo_root" ] && [ -x "$repo_root/scripts/check-clean-trees.sh" ]; then
  tree_output="$("$repo_root/scripts/check-clean-trees.sh" 2>&1 || true)"
  if [ -n "$tree_output" ]; then
    echo "" >&2
    echo "$tree_output" >&2
    echo "COMMIT THESE CHANGES BEFORE PROCEEDING WITH SESSION-END." >&2
  fi
fi

exit 2
