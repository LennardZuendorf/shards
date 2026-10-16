#!/usr/bin/env bash
# Build a realistic Shards demo vault + config with the `shards` CLI (plus one awk edit that
# stores each project's `sections:` order, which no CLI verb sets).
#
#   scripts/demo-vault.sh [--force] [--empty] [DIR]   (default DIR: /tmp/shards-demo)
#
# Writes DIR/config.toml and DIR/vault/. --empty stops after the config (identity, members):
# an empty vault, the app's first-run onboarding state. Refuses when DIR exists, unless
# --force is given and DIR is empty or was made by this script (it carries a .shards-demo
# marker).
# Dates are relative to today, so the Today / Upcoming views always have content.
#
# Then:  cargo run -p shards-host -- --config DIR/config.toml
#        pnpm -C apps/desktop dev        (http://localhost:5173)
set -euo pipefail

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; }

FORCE=0
EMPTY=0
DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --empty) EMPTY=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "demo-vault: unknown flag: $1" >&2; usage >&2; exit 2 ;;
    *) [ -z "$DIR" ] || { echo "demo-vault: one DIR only" >&2; exit 2; }; DIR="$1" ;;
  esac
  shift
done
DIR="${DIR:-/tmp/shards-demo}"

# --- the shards binary -------------------------------------------------------------------
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${SHARDS_BIN:-}"
if [ -z "$BIN" ]; then
  for c in "$ROOT/target/debug/shards" "$ROOT/target/release/shards"; do
    if [ -x "$c" ]; then BIN="$c"; break; fi
  done
fi
if [ -z "$BIN" ]; then
  echo "demo-vault: no shards binary; run 'cargo build' first or set SHARDS_BIN" >&2
  exit 1
fi
# Crystal also ships a `shards` binary; make sure this is ours.
if ! "$BIN" --help 2>/dev/null | grep -q 'session-start'; then
  echo "demo-vault: $BIN is not the Shards CLI" >&2
  exit 1
fi

# --- the target folder -------------------------------------------------------------------
MARKER=".shards-demo"
if [ -e "$DIR" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "demo-vault: $DIR already exists (pass --force to rebuild it)" >&2
    exit 1
  fi
  if [ -f "$DIR/$MARKER" ] || [ -z "$(ls -A "$DIR" 2>/dev/null)" ]; then
    rm -rf "$DIR"
  else
    echo "demo-vault: refusing --force: $DIR is not empty and was not made by this script" >&2
    exit 1
  fi
fi
mkdir -p "$DIR/vault"
DIR="$(cd "$DIR" && pwd -P)"
touch "$DIR/$MARKER"
CFG="$DIR/config.toml"
VAULT="$DIR/vault"

# Never let the caller's environment redirect writes or change the acting identity.
unset SHARDS_AGENT MESH_AGENT SHARDS_VAULT MESH_VAULT SHARDS_CONFIG_PATH MESH_CONFIG_PATH

sh_() { "$BIN" --config "$CFG" --vault "$VAULT" "$@"; }
# `as <identity> <args…>`: run one command acting as another member.
as() { local who="$1"; shift; sh_ --owner "$who" "$@"; }

# --- dates (BSD and GNU date) --------------------------------------------------------------
day() { # day <offset-days> -> YYYY-MM-DD
  local n="$1"
  if date -v+0d +%F >/dev/null 2>&1; then
    if [ "$n" -ge 0 ]; then date -v+"$n"d +%F; else date -v"$n"d +%F; fi
  else
    date -d "$n days" +%F
  fi
}
dow_today="$(date +%u)" # 1 = Monday … 7 = Sunday
next_dow() { # next_dow <1..7> -> offset to the next such weekday (0 when it is today)
  echo $(( ($1 - dow_today + 7) % 7 ))
}
TODAY="$(day 0)"; TOMORROW="$(day 1)"
OFF_MON="$(next_dow 1)"; [ "$OFF_MON" -eq 0 ] && OFF_MON=7
OFF_THU="$(next_dow 4)"; OFF_FRI="$(next_dow 5)"; OFF_SUN="$(next_dow 7)"
OFF_WEEKDAY=0; [ "$dow_today" -ge 6 ] && OFF_WEEKDAY="$OFF_MON"

# --- config ------------------------------------------------------------------------------
SHARDS_CONFIG_PATH="$CFG" "$BIN" init --path "$VAULT" --agent lennard \
  --collections lennard,maya,claude-code,flights-agent,ops-agent --engine builtin >/dev/null
# `config set` only knows core keys; [core].me and [[members]] are host keys, appended here.
tmp="$(mktemp "$DIR/.config.XXXXXX")"
awk '{ print } /^agent = / { print "me = \"lennard\"" }' "$CFG" >"$tmp" && mv "$tmp" "$CFG"
cat >>"$CFG" <<'TOML'

# Display names, kinds and colours for the desktop app. [tasks].collections stays the
# validation roster; members only enrich it.
[[members]]
id = "lennard"
kind = "human"
name = "Lennard"
color = "#7c3aed"

[[members]]
id = "maya"
kind = "human"
name = "Maya Chen"
color = "#0ea5e9"

[[members]]
id = "claude-code"
kind = "agent"
name = "Claude Code"
color = "#d97706"

[[members]]
id = "flights-agent"
kind = "agent"
name = "Flights Agent"
color = "#059669"

[[members]]
id = "ops-agent"
kind = "agent"
name = "Ops Agent"
color = "#e11d48"
TOML

if [ "$EMPTY" -eq 1 ]; then
  echo "empty demo vault ready"
  echo "  config: $CFG"
  echo "  vault:  $VAULT"
  echo
  echo "run:  cargo run -p shards-host -- --config $CFG"
  echo "      pnpm -C apps/desktop dev"
  exit 0
fi

# --- projects ----------------------------------------------------------------------------
project() { sh_ --quiet note new "$1" --type project --body "$2"; }
P_LAUNCH="$(project "Shards Launch" "Public launch of the Shards desktop app and 0.3.0 CLI.

**Goal:** 500 installs in launch week, 50 paying Personal Sync users by end of Q4.

- Launch date: end of next week
- Channels: blog, Product Hunt, Hacker News, the Obsidian forum")"
P_FLIGHTS="$(project "Flights Agent" "Autonomous agent that watches partner fares and alerts on price drops.

Runs every morning; owned by flights-agent, reviewed weekly by Lennard.")"
P_HOME="$(project "Home" "Errands, bills and house stuff.")"
P_Q4="$(project "Q4 Planning" "OKRs, hiring and budget for Q4.

Draft due before the offsite; Maya owns hiring, ops-agent keeps the budget sheet current.")"

# A project's section list and order live in its note's `sections:` frontmatter (what the app's
# host_project_update writes). No CLI verb sets it, so append it to the note's frontmatter: the
# board and list then start from a stable column order instead of one derived from task order.
sections() { # sections <project-id> <name>…
  local id="$1"; shift
  local file
  file="$(grep -rlx -- "id: $id" "$VAULT" | head -n 1)"
  [ -n "$file" ] || { echo "demo-vault: no file for $id" >&2; exit 1; }
  local list="sections:"
  local name
  for name in "$@"; do list="$list
  - $name"; done
  SECTIONS="$list" awk 'NR > 1 && !done && $0 == "---" { print ENVIRON["SECTIONS"]; done = 1 } { print }' "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}
sections "$P_LAUNCH" Marketing Build Next
sections "$P_FLIGHTS" Ingestion Pricing Ops
sections "$P_HOME" Bills Errands House
sections "$P_Q4" Goals Hiring Budget

# --- tasks -------------------------------------------------------------------------------
# t <title> [shards task new flags…] -> prints the new id
t() { local title="$1"; shift; sh_ --quiet task new "$title" "$@"; }
claim() { as "$1" task claim --no-strict "$2" >/dev/null 2>&1; }
finish() { as "$1" task finish "$2" ${3:+--outcome "$3"} >/dev/null 2>&1; }

# Shards Launch
L_PRICING="$(t "Finalize pricing page copy" --project "$P_LAUNCH" --section "Marketing" --order 1 \
  --priority urgent --due "$TODAY" --deadline "$(day 3)" --tags launch,copy \
  --body "Personal Sync \$5/mo or \$48/yr. Team \$8 per human seat; agents are free members.

- [ ] Headline + subhead
- [ ] FAQ: what counts as a seat?
- [ ] Legal review of the refund line")"
L_POST="$(t "Write launch blog post" --project "$P_LAUNCH" --section "Marketing" --order 2 \
  --priority high --due "$TOMORROW" --tags launch,writing \
  --body "Angle: one Markdown folder that you, your team and your agents all work in.")"
L_OUTLINE="$(t "Draft outline" --parent "$L_POST" --project "$P_LAUNCH" --section "Marketing" --order 2.1 --tags writing)"
L_SHOTS="$(t "Collect screenshots from the desktop app" --parent "$L_POST" --project "$P_LAUNCH" \
  --section "Marketing" --order 2.2 --owner claude-code --due "$(day 1)" --tags writing,design)"
L_VIDEO="$(t "Record 90-second demo video" --project "$P_LAUNCH" --section "Marketing" --order 3 \
  --priority high --due "$(day 2)" --tags launch,video \
  --body "Script: quick add → agent claims → memory recall → done. No voice-over, captions only.")"
L_PH="$(t "Set up Product Hunt listing" --project "$P_LAUNCH" --section "Marketing" --order 4 \
  --owner maya --due "$(day 8)" --tags launch)"
L_FLAKE="$(t "Fix flaky recurrence test on CI" --project "$P_LAUNCH" --section "Build" --order 1 \
  --priority urgent --due "$(day -1)" --owner claude-code --tags ci,bug \
  --body "Fails ~1 in 20 runs on the macOS runner. Suspect local-midnight rollover in the yearly Feb 29 case.")"
L_NOTARIZE="$(t "Sign and notarize the macOS build" --project "$P_LAUNCH" --section "Build" --order 2 \
  --priority high --due "$(day 4)" --deadline "$(day 6)" --tags release --blocked-by "$L_FLAKE")"
L_SHIP="$(t "Ship 0.3.0" --project "$P_LAUNCH" --section "Build" --order 3 \
  --priority urgent --due "$(day 6)" --deadline "$(day 7)" --tags release --blocked-by "$L_NOTARIZE")"
L_BENCH="$(t "Benchmark CLI cold start under 10 ms" --project "$P_LAUNCH" --section "Build" --order 4 \
  --owner claude-code --tags perf)"
L_ICON="$(t "Design the app icon" --project "$P_LAUNCH" --section "Next" --order 1 --tags design)"
L_DOCS="$(t "Write MCP setup docs" --project "$P_LAUNCH" --section "Next" --order 2 \
  --owner claude-code --due "$(day 5)" --tags docs)"
L_EMPTY="$(t "Audit onboarding empty states" --project "$P_LAUNCH" --section "Next" --order 3 \
  --priority low --tags design)"
L_BETA="$(t "Reply to beta tester feedback" --project "$P_LAUNCH" --section "Next" --order 4 \
  --due "$(day "$OFF_FRI")" --recur "FREQ=WEEKLY;BYDAY=FR" --tags feedback)"

# Flights Agent
F_SCRAPE="$(t "Scrape fare updates from the partner API" --project "$P_FLIGHTS" --section "Ingestion" \
  --order 1 --priority high --due "$TODAY" --owner flights-agent --tags agent,ingestion)"
F_IATA="$(t "Normalize airport codes to IATA" --project "$P_FLIGHTS" --section "Ingestion" --order 2 \
  --owner flights-agent --tags agent,ingestion)"
F_429="$(t "Handle 429 rate limits with backoff" --project "$P_FLIGHTS" --section "Ingestion" --order 3 \
  --priority urgent --due "$(day -2)" --owner flights-agent --tags agent,bug,needs-input \
  --body "Partner returns 429 after ~60 req/min. Need a decision: jittered exponential backoff, or a token bucket shared across workers?")"
F_ALERTS="$(t "Price-drop alerts for saved routes" --project "$P_FLIGHTS" --section "Pricing" --order 1 \
  --due "$(day 9)" --tags feature --blocked-by "$F_429")"
F_EUR="$(t "Convert EUR fares before comparing" --project "$P_FLIGHTS" --section "Pricing" --order 2 \
  --priority low --owner flights-agent --tags agent)"
F_SNAPSHOT="$(t "Daily fare snapshot" --project "$P_FLIGHTS" --section "Ops" --order 1 \
  --due "${TODAY}T07:00" --recur "FREQ=DAILY" --owner flights-agent --tags agent,report)"
F_BUDGET="$(t "Review flights-agent error budget" --project "$P_FLIGHTS" --section "Ops" --order 2 \
  --priority high --due "$(day "$OFF_MON")" --recur "FREQ=WEEKLY;BYDAY=MO" --tags review)"
F_CONTRACT="$(t "Confirm partner contract renewal" --project "$P_FLIGHTS" --section "Ops" --order 3 \
  --priority high --owner maya --deadline "$(day 12)" --tags needs-input,legal)"
F_GQL="$(t "Migrate to the partner GraphQL endpoint" --project "$P_FLIGHTS" --section "Ingestion" \
  --order 4 --owner flights-agent --tags agent)"

# Home
H_BILL="$(t "Pay electricity bill" --project "$P_HOME" --section "Bills" --order 1 --priority high \
  --due "$(day 5)" --recur "FREQ=MONTHLY" --tags bills)"
H_DENTIST="$(t "Book dentist appointment" --project "$P_HOME" --section "Errands" --order 1 \
  --due "${TOMORROW}T09:00" --tags health)"
H_PLANTS="$(t "Water the plants" --project "$P_HOME" --section "House" --order 1 \
  --due "$TODAY" --recur "FREQ=DAILY;INTERVAL=3" --recur-from completion --tags chores)"
H_GIFT="$(t "Buy birthday gift for Anna" --project "$P_HOME" --section "Errands" --order 2 \
  --priority high --due "$(day 4)" --deadline "$(day 5)" --tags errands)"
H_TAP="$(t "Fix the leaking kitchen tap" --project "$P_HOME" --section "House" --order 2 \
  --due "$(day -3)" --tags house)"
H_PASSPORT="$(t "Renew passport" --project "$P_HOME" --section "Errands" --order 3 --priority low \
  --due "$(day 11)" --deadline "$(day 30)" --tags admin)"
H_RECYCLE="$(t "Take out the recycling" --project "$P_HOME" --section "House" --order 3 \
  --due "$(day "$OFF_THU")" --recur "FREQ=WEEKLY;BYDAY=TH" --tags chores)"

# Q4 Planning
Q_OKR="$(t "Draft Q4 OKRs" --project "$P_Q4" --section "Goals" --order 1 --priority urgent \
  --due "$TOMORROW" --deadline "$(day 3)" --tags planning \
  --body "Three objectives max. Each KR measurable without a dashboard we do not have yet.")"
Q_REVIEW="$(t "Review the OKR draft" --parent "$Q_OKR" --project "$P_Q4" --section "Goals" --order 1.1 \
  --owner maya --due "$(day 3)" --tags planning)"
Q_SLACK="$(t "Summarize roadmap feedback from Slack" --parent "$Q_OKR" --project "$P_Q4" --section "Goals" \
  --order 1.2 --owner claude-code --due "$TODAY" --tags planning,agent)"
Q_OFFSITE="$(t "Plan the team offsite" --project "$P_Q4" --section "Goals" --order 2 --priority low --tags team)"
Q_JD="$(t "Write the senior Rust engineer JD" --project "$P_Q4" --section "Hiring" --order 1 \
  --priority high --owner maya --due "$(day 6)" --tags hiring)"
Q_FORECAST="$(t "Update the budget forecast sheet" --project "$P_Q4" --section "Budget" --order 1 \
  --due "$(day 9)" --owner ops-agent --tags finance,agent)"
Q_VENDORS="$(t "Quarterly vendor cost review" --project "$P_Q4" --section "Budget" --order 2 \
  --owner ops-agent --tags finance)"

# Inbox (no project)
I_MOM="$(t "Call Mom" --due "${TODAY}T18:30")"
I_DOMAIN="$(t "Renew the shards.app domain" --priority urgent --due "$TODAY" --deadline "$(day 2)" --tags admin)"
I_READ="$(t "Read DDIA chapter 5 (replication)" --priority low --tags reading)"
I_TRIAGE="$(t "Try a triage flow for ideas" --tags ideas)"
I_WEEKLY="$(t "Weekly review" --priority high --due "$(day "$OFF_SUN")" --recur "FREQ=WEEKLY;BYDAY=SU" --tags review)"
I_KEYS="$(t "Rotate API keys for staging" --priority high --due "$(day -1)" --owner ops-agent --tags security,agent)"
I_BRANCHES="$(t "Clean up stale git branches" --owner ops-agent --tags chores,agent)"
I_RECALL="$(t "Investigate memory recall ranking oddity" --due "$(day 2)" --owner claude-code --tags investigation,agent \
  --body "Superseded memories still rank above their replacement when the query matches the old title exactly.")"
I_STANDUP="$(t "Write standup notes" --due "$(day "$OFF_WEEKDAY")T09:30" \
  --recur "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" --tags routine)"
I_BACKUP="$(t "Back up the vault to the external drive" --tags chores)"
I_README="$(t "Update README screenshots" --owner claude-code --tags docs --blocked-by "$L_SHOTS")"

# Work in progress: agents hold claims.
claim claude-code "$L_FLAKE"
claim claude-code "$L_SHOTS"
claim claude-code "$Q_SLACK"
claim flights-agent "$F_SCRAPE"
claim flights-agent "$F_429"
claim ops-agent "$I_KEYS"
claim ops-agent "$Q_FORECAST"
claim maya "$Q_JD"

# Done and cancelled.
finish lennard "$L_OUTLINE"
finish claude-code "$L_BENCH" "Cold start is 6.1 ms (p50) / 8.4 ms (p95) on an M2."
finish lennard "$L_ICON"
finish flights-agent "$F_IATA" "All 1,214 partner airport strings map to IATA codes."
finish ops-agent "$Q_VENDORS" "Saved 18% by dropping the unused log vendor."
finish ops-agent "$I_BRANCHES"
finish lennard "$I_BACKUP"
as flights-agent task cancel "$F_GQL" --reason "Partner postponed the GraphQL rollout to next year." >/dev/null

# Progress notes on a few tasks (appends carry an attribution stamp).
as claude-code task append "$L_FLAKE" --timestamp "Reproduced locally with TZ=Pacific/Kiritimati. Fix incoming." >/dev/null
as flights-agent task append "$F_429" --timestamp "Waiting on a decision from Lennard (see body). Paused retries." >/dev/null

# --- notes -------------------------------------------------------------------------------
note() { local title="$1" type="$2" body="$3"; shift 3; sh_ --quiet note new "$title" --type "$type" --body "$body" "$@"; }
note "Partner API Notes" reference "Base URL is versioned (v3). Auth: per-key bearer token.

- Rate limit: 60 requests/min per key (429 above that)
- Fares are quoted in the origin airport's currency
- Webhooks are not available; poll the /fares/changes cursor" --tags flights,api --owner flights-agent >/dev/null
note "Flights Agent Architecture" reference "Pipeline: scrape → normalize → snapshot → alert.

The agent runs in [[Flights Agent]] and reads its limits from [[Partner API Notes]].
State between runs lives in its scratchpad, never in the task bodies." --tags flights,architecture >/dev/null
note "Shards Launch Plan" note "Launch checklist for [[Shards Launch]].

1. Ship 0.3.0 with recurrence and the desktop app
2. Publish the blog post and the demo video
3. Post to Product Hunt and Hacker News the same morning" --tags launch >/dev/null
note "Pricing Decision" decision "We charge for sync, never for agents. See [[Shards Launch Plan]].

- Local: free forever
- Personal Sync: \$5/mo
- Team: \$8 per human seat; agents are free members" --tags launch,pricing >/dev/null
note "Weekly Review $(date +%G)-W$(date +%V)" log "Wins: recurrence landed, flights-agent stable for 5 days.

Next: [[Q4 Planning]] OKRs, then [[Shards Launch]] dry run." --tags review >/dev/null
note "Agent Operating Guide" note "How agents work in this vault.

- Claim before you start, finish with an outcome, release if you stop.
- Put working state in scratch, durable lessons in memories.
- API limits: [[Partner API Notes]]. Launch context: [[Shards Launch Plan]]." --tags agents,process >/dev/null
sh_ note append "Shards Launch Plan" "Pricing rationale: [[Pricing Decision]]." >/dev/null

# --- memories ----------------------------------------------------------------------------
mem() { local who="$1" title="$2"; shift 2; sh_ --quiet memory new "$title" --owner "$who" "$@"; }
mem claude-code "Lennard prefers small PRs with conventional commits" --kind preference --importance 4 \
  --tags workflow --body "Subject at most 50 chars, imperative. One concern per PR." >/dev/null
mem claude-code "Run the core test suite before calling a core task done" --kind procedure --importance 5 \
  --tags workflow,rust --body "cargo test -p shards; clippy -D warnings must be clean." >/dev/null
mem claude-code "Finishing a recurring task advances due in place" --kind fact --importance 3 \
  --project "$P_LAUNCH" --tags recurrence --body "No new file is created; the response carries next_due." >/dev/null
mem claude-code "CI flake is a timezone rollover in the recurrence tests" --kind insight --importance 4 \
  --project "$P_LAUNCH" --tags ci --source "$L_FLAKE" --body "Only reproduces when local midnight differs from UTC midnight." >/dev/null
mem claude-code "Desktop build currently needs pnpm 10" --kind fact --importance 2 --expires 2d \
  --tags tooling --body "Temporary until the lockfile is regenerated." >/dev/null
M_OLD="$(mem flights-agent "Partner API allows 30 requests per minute" --kind fact --importance 4 \
  --project "$P_FLIGHTS" --tags api --body "From the v2 docs.")"
mem flights-agent "Partner API allows 60 requests per minute per key" --kind fact --importance 5 \
  --project "$P_FLIGHTS" --tags api --supersedes "$M_OLD" --body "Raised in v3; confirmed by a 429 at request 61." >/dev/null
mem flights-agent "EUR fares must be converted before comparison" --kind insight --importance 3 \
  --project "$P_FLIGHTS" --tags pricing --body "Mixed-currency comparisons produced three false price-drop alerts." >/dev/null
mem flights-agent "Scrape run summary $(day -1)" --kind episode --importance 2 --expires 7d \
  --project "$P_FLIGHTS" --body "1,980 fares fetched, 42 changed, 2 retries after 429." >/dev/null
mem ops-agent "Staging deploys go through the ops runbook" --kind procedure --importance 4 \
  --tags ops --body "Never deploy staging from a laptop; use the runbook pipeline." >/dev/null
mem ops-agent "Maya approves vendor spend above 500 EUR" --kind fact --importance 4 \
  --project "$P_Q4" --tags finance --body "Below 500 EUR ops-agent may approve on its own; log it in the budget sheet." >/dev/null
mem lennard "I review agent PRs first thing in the morning" --kind preference --scope private \
  --importance 3 --tags workflow --body "Queue PRs for review before 10:00; after that they wait a day." >/dev/null

# --- scratchpads -------------------------------------------------------------------------
sh_ scratch set current-session --agent claude-code --body "## Now
Fixing $L_FLAKE (flaky recurrence test).

- [x] Reproduce with TZ=Pacific/Kiritimati
- [ ] Pin the clock in recur::tests
- [ ] Re-run the macOS job 20x

## Then
Screenshots for $L_SHOTS: Today, Upcoming, project board (dark + light)." >/dev/null
sh_ scratch set pr-checklist --agent claude-code --body "- fmt + clippy -D warnings
- cargo test -p shards
- update README if a flag changed
- conventional commit subject <= 50 chars" >/dev/null
sh_ scratch set scrape-run --agent flights-agent --body "cursor: 2026-fares-7c41
routes watched: 37
last run: 1,980 fares, 42 changed
backoff: paused (waiting on $F_429)" >/dev/null
sh_ scratch set key-rotation --agent ops-agent --body "Rotating staging keys ($I_KEYS)

1. payments-sandbox   done
2. partner-api        in progress
3. email-provider     todo
4. analytics          todo" >/dev/null

# --- summary -----------------------------------------------------------------------------
sh_ status >/dev/null 2>&1 || true
echo "demo vault ready"
echo "  config: $CFG"
echo "  vault:  $VAULT"
echo "  tasks:  $(find "$VAULT/tasks" -name '*.md' -not -path '*/.locks/*' | wc -l | tr -d ' ')"
echo "  notes:  $(find "$VAULT/notes" -name '*.md' | wc -l | tr -d ' ')"
echo "  memories: $(find "$VAULT/memories" -name '*.md' | wc -l | tr -d ' ')"
echo "  scratch:  $(find "$VAULT/scratch" -name '*.md' -not -path '*/.locks/*' | wc -l | tr -d ' ')"
echo
echo "run:  cargo run -p shards-host -- --config $CFG"
echo "      pnpm -C apps/desktop dev"
