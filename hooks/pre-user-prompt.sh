#!/bin/bash
# Windsurf pre_user_prompt hook: session-end protocol enforcement.
#
# Scans the user's prompt for session-end trigger phrases. If found, blocks
# the prompt (exit 2) and injects a stderr message that the agent sees,
# forcing it to invoke fo-session-retro before producing any output.
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
1. Verify clean working tree (rtk git status)
2. Verify RFC implementation status
3. Invoke fo-session-retro via the skill tool
4. The retro skill's report IS the session-end output
EOF

exit 2
