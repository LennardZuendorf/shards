//! Plugin-bundle invariants (final.md §14.1 L9).
//!
//! The Rust successor to the Python `tests/test_plugin_bundle.py`: every pinned property of
//! `plugins/shards/**`, `hooks/session_start.json` and `.claude-plugin/marketplace.json`,
//! asserted against the **live** clap tree (`shards --help` / `shards <cmd> --help`) and the live
//! tool table (`shards::mcp::{TOOL_NAMES, DESTRUCTIVE_TOOLS}`) rather than against a second copy
//! of either. Plus `config.example.toml`, which must load through `shards::config::from_table`.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde_json::Value as Json;

// ---------------------------------------------------------------------------------------
// repo layout
// ---------------------------------------------------------------------------------------

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read(rel: &str) -> String {
    let path = repo_root().join(rel);
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
}

fn read_json(rel: &str) -> Json {
    serde_json::from_str(&read(rel)).unwrap_or_else(|e| panic!("parse {rel}: {e}"))
}

/// The directory cargo put this test's binaries in (`target/<profile>/`).
fn target_bin_dir() -> PathBuf {
    let exe = std::env::current_exe().expect("current_exe");
    // .../target/<profile>/deps/bundle-<hash>
    exe.parent()
        .and_then(Path::parent)
        .expect("target/<profile>")
        .to_path_buf()
}

const SKILL: &str = "plugins/shards/skills/shards/SKILL.md";
const PLUGIN_JSON: &str = "plugins/shards/.claude-plugin/plugin.json";
const MCP_JSON: &str = "plugins/shards/.mcp.json";
const BUNDLED_HOOKS: &str = "plugins/shards/hooks/hooks.json";
const CANONICAL_HOOKS: &str = "hooks/session_start.json";
const MARKETPLACE: &str = ".claude-plugin/marketplace.json";

/// The only command words that may appear in any bundle JSON.
const BINARIES: [&str; 2] = ["shards", "shards-mcp"];

// ---------------------------------------------------------------------------------------
// the live clap tree
// ---------------------------------------------------------------------------------------

fn help_for(args: &[&str]) -> String {
    let mut cmd = assert_cmd::Command::cargo_bin("shards").expect("shards binary");
    cmd.env_remove("SHARDS_CONFIG_PATH")
        .env_remove("SHARDS_AGENT")
        .env_remove("SHARDS_VAULT");
    let out = cmd.args(args).arg("--help").output().expect("run --help");
    assert!(
        out.status.success(),
        "`shards {} --help` failed",
        args.join(" ")
    );
    String::from_utf8(out.stdout).expect("utf-8 help")
}

/// The subcommand names clap lists under `Commands:` in a `--help` page.
fn subcommands(args: &[&str]) -> BTreeSet<String> {
    let help = help_for(args);
    let mut names = BTreeSet::new();
    let mut in_commands = false;
    for line in help.lines() {
        if line.starts_with("Commands:") {
            in_commands = true;
            continue;
        }
        if in_commands {
            if line.trim().is_empty() {
                break;
            }
            if let Some(first) = line.split_whitespace().next() {
                names.insert(first.to_string());
            }
        }
    }
    assert!(
        !names.is_empty(),
        "`shards {} --help` listed no subcommands",
        args.join(" ")
    );
    names
}

// ---------------------------------------------------------------------------------------
// SKILL.md
// ---------------------------------------------------------------------------------------

struct Skill {
    text: String,
    frontmatter: String,
    body: String,
}

impl Skill {
    fn load() -> Skill {
        let text = read(SKILL);
        let rest = text
            .strip_prefix("---\n")
            .expect("SKILL.md starts with a frontmatter fence");
        let end = rest
            .find("\n---\n")
            .expect("SKILL.md closes its frontmatter");
        let frontmatter = rest[..end].to_string();
        let body = rest[end + 5..].to_string();
        Skill {
            text,
            frontmatter,
            body,
        }
    }

    /// Top-level frontmatter keys, in file order.
    fn keys(&self) -> Vec<String> {
        self.frontmatter
            .lines()
            .filter(|l| !l.starts_with(' ') && !l.starts_with('-') && l.contains(':'))
            .filter_map(|l| l.split(':').next())
            .map(str::to_string)
            .collect()
    }

    /// The `allowed-tools:` list, as bare tool names (the `mcp__shards__` prefix stripped).
    fn allowed_tools(&self) -> Vec<String> {
        let mut out = Vec::new();
        let mut inside = false;
        for line in self.frontmatter.lines() {
            if line.starts_with("allowed-tools:") {
                inside = true;
                continue;
            }
            if inside {
                match line.strip_prefix("  - ") {
                    Some(entry) => {
                        let entry = entry.trim();
                        let name = entry.strip_prefix("mcp__shards__").unwrap_or_else(|| {
                            panic!("allowed-tools entry is not a shards MCP tool: {entry}")
                        });
                        out.push(name.to_string());
                    }
                    None => break,
                }
            }
        }
        out
    }

    /// The `## Command surface this playbook assumes` section.
    fn command_surface(&self) -> &str {
        let start = self
            .body
            .find("## Command surface this playbook assumes")
            .expect("SKILL.md has a command-surface section");
        &self.body[start..]
    }

    /// `family {a,b,c}` groups named in the command-surface section.
    fn command_groups(&self) -> Vec<(String, Vec<String>)> {
        let section = self.command_surface();
        let mut groups = Vec::new();
        let mut rest = section;
        while let Some(open) = rest.find(" {") {
            let (head, tail) = rest.split_at(open);
            let family = head
                .rsplit(|c: char| c == '`' || c.is_whitespace())
                .next()
                .unwrap_or_default()
                .to_string();
            let close = match tail.find('}') {
                Some(i) => i,
                None => break,
            };
            let subs: Vec<String> = tail[2..close]
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            if !family.is_empty() && !subs.is_empty() {
                groups.push((family, subs));
            }
            rest = &tail[close + 1..];
        }
        groups
    }
}

// ---------------------------------------------------------------------------------------
// binaries and wiring
// ---------------------------------------------------------------------------------------

#[test]
fn both_binaries_are_built() {
    let dir = target_bin_dir();
    for name in BINARIES {
        let path = dir.join(name);
        let path = if path.exists() {
            path
        } else {
            dir.join(format!("{name}.exe"))
        };
        assert!(
            path.exists(),
            "expected the `{name}` binary at {}",
            path.display()
        );
    }
}

#[test]
fn the_mcp_json_names_exactly_the_shim_binary() {
    let json = read_json(MCP_JSON);
    let servers = json["mcpServers"]
        .as_object()
        .expect(".mcp.json has an mcpServers object");
    assert_eq!(servers.len(), 1, "exactly one MCP server is wired");
    let server = servers.get("shards").expect("the server is named `shards`");
    assert_eq!(
        server["command"], "shards-mcp",
        "the bundle must invoke the shim binary"
    );
    assert!(
        server.get("args").is_none(),
        "`shards-mcp` takes no arguments"
    );
}

#[test]
fn only_real_binaries_appear_as_command_words_in_bundle_json() {
    for rel in [
        MCP_JSON,
        BUNDLED_HOOKS,
        CANONICAL_HOOKS,
        PLUGIN_JSON,
        MARKETPLACE,
    ] {
        let text = read(rel);
        for word in text.split(|c: char| !(c.is_alphanumeric() || c == '-' || c == '_')) {
            if word == "shards" || word.starts_with("shards-") || word.starts_with("shards_") {
                assert!(
                    BINARIES.contains(&word) || word.starts_with("shards_"),
                    "{rel} names `{word}`, which is not a shards binary"
                );
            }
        }
    }
}

#[test]
fn the_session_start_entry_is_byte_identical_to_the_canonical_hook() {
    let bundled = read_json(BUNDLED_HOOKS);
    let canonical = read_json(CANONICAL_HOOKS);
    assert_eq!(
        canonical["hooks"].as_object().map(|m| m.len()),
        Some(1),
        "`hooks/session_start.json` stays the canonical SessionStart hook and nothing else"
    );
    let entry = &bundled["hooks"]["SessionStart"];
    assert_eq!(
        serde_json::to_string(entry).expect("serialize the bundled entry"),
        serde_json::to_string(&canonical["hooks"]["SessionStart"])
            .expect("serialize the canonical"),
        "the bundled SessionStart entry must stay byte-identical to the canonical one"
    );
    let command = entry[0]["hooks"][0]["command"]
        .as_str()
        .expect("the hook runs a command");
    assert_eq!(command, "shards session-start --meta-only --json");
    let leaf = command.split_whitespace().nth(1).unwrap_or_default();
    assert!(
        subcommands(&[]).contains(leaf),
        "the hook invokes `{leaf}`, which is not a live command"
    );
}

#[test]
fn the_hooks_file_carries_exactly_the_two_shipped_events() {
    let json = read_json(BUNDLED_HOOKS);
    let events = json["hooks"]
        .as_object()
        .expect("hooks.json has a hooks object");
    let mut names: Vec<&str> = events.keys().map(String::as_str).collect();
    names.sort();
    assert_eq!(names, vec!["PostToolUse", "SessionStart"]);
}

#[test]
fn the_finish_without_outcome_hook_is_well_formed() {
    let json = read_json(BUNDLED_HOOKS);
    let entries = json["hooks"]["PostToolUse"]
        .as_array()
        .expect("a PostToolUse array");
    assert_eq!(entries.len(), 1, "exactly one PostToolUse entry ships");
    let matcher = entries[0]["matcher"]
        .as_str()
        .expect("the entry carries a matcher");
    assert!(
        matcher.contains("shards_task_finish"),
        "the matcher must target `shards_task_finish`, got `{matcher}`"
    );
    let hooks = entries[0]["hooks"].as_array().expect("a hooks array");
    assert_eq!(hooks.len(), 1, "exactly one command hook runs");
    assert_eq!(hooks[0]["type"], "command");
    let command = hooks[0]["command"].as_str().expect("a command");
    assert_eq!(
        command, "sh \"$CLAUDE_PLUGIN_ROOT/hooks/remind-outcome.sh\"",
        "the hook runs the bundled reminder script through `sh`"
    );
    assert!(
        entries[0]["hooks"][0].get("args").is_none(),
        "shell form: the command must stay a shell string, not exec form"
    );
}

#[test]
fn the_reminder_script_is_executable_and_starts_with_posix_sh() {
    let script = repo_root().join("plugins/shards/hooks/remind-outcome.sh");
    assert!(
        script.is_file(),
        "plugins/shards/hooks/remind-outcome.sh exists"
    );
    let text = std::fs::read_to_string(&script).expect("read the reminder script");
    assert!(
        text.starts_with("#!/bin/sh\n"),
        "the script starts with a `#!/bin/sh` shebang"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&script)
            .expect("stat the script")
            .permissions()
            .mode();
        assert_eq!(
            mode & 0o111,
            0o111,
            "the hook script must be executable, mode {mode:o}"
        );
    }
}

/// Feed a hook payload to the reminder script on stdin and return its output.
fn run_reminder(payload: &str) -> std::process::Output {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let script = repo_root().join("plugins/shards/hooks/remind-outcome.sh");
    let mut child = Command::new("sh")
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn `sh remind-outcome.sh`");
    child
        .stdin
        .take()
        .expect("the child's stdin")
        .write_all(payload.as_bytes())
        .expect("write the payload");
    child.wait_with_output().expect("wait for the hook")
}

#[test]
fn the_reminder_stays_silent_when_the_outcome_is_recorded() {
    let payload = r#"{"hook_event_name":"PostToolUse","tool_name":"mcp__plugin_shards_shards__shards_task_finish","tool_input":{"id":"t-abc","status":"done","outcome":"shipped slice 1"},"tool_response":{"id":"t-abc","outcome":"shipped slice 1"}}"#;
    let out = run_reminder(payload);
    assert_eq!(
        out.status.code(),
        Some(0),
        "a recorded outcome exits 0, stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(out.stdout.is_empty(), "the hook never writes to stdout");
    assert!(out.stderr.is_empty(), "a recorded outcome says nothing");
}

/// `grep` is line-oriented, so a pretty-printed payload puts the key and its
/// value on separate lines. The reminder must still read that as an outcome.
#[test]
fn the_reminder_copes_with_a_multiline_payload() {
    let payload = r#"{
  "hook_event_name": "PostToolUse",
  "tool_input": {
    "id": "t-abc",
    "status": "done",
    "outcome":
      "shipped slice 1"
  }
}"#;
    let out = run_reminder(payload);
    assert_eq!(
        out.status.code(),
        Some(0),
        "a multiline outcome exits 0, stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    assert!(out.stdout.is_empty(), "the hook never writes to stdout");
    assert!(
        out.stderr.is_empty(),
        "a multiline outcome must not nag: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn the_reminder_fires_when_the_outcome_is_missing() {
    for payload in [
        // no `outcome` key at all
        r#"{"hook_event_name":"PostToolUse","tool_name":"mcp__plugin_shards_shards__shards_task_finish","tool_input":{"id":"t-abc","status":"done"}}"#,
        // an empty string is not an outcome
        r#"{"tool_input":{"id":"t-abc","outcome":""}}"#,
        // neither is an explicit null
        r#"{"tool_input":{"id":"t-abc","outcome":null}}"#,
        // and an empty payload is not evidence of an outcome either
        "",
    ] {
        let out = run_reminder(payload);
        assert_eq!(
            out.status.code(),
            Some(2),
            "payload `{payload}` must exit 2, stderr: {}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert!(out.stdout.is_empty(), "the hook never writes to stdout");
        let err = String::from_utf8_lossy(&out.stderr);
        assert!(
            err.contains("shards_task_append"),
            "the reminder must name the remedy, got: {err}"
        );
    }
}

#[test]
fn the_plugin_manifest_is_well_formed() {
    let json = read_json(PLUGIN_JSON);
    assert_eq!(json["name"], "shards");
    assert_eq!(json["license"], "MIT");
    assert_eq!(
        json["version"],
        shards::VERSION,
        "the plugin version tracks the crate version"
    );
    let description = json["description"].as_str().unwrap_or_default();
    assert!(!description.is_empty(), "the plugin needs a description");
    for space in ["notes", "tasks", "memories", "scratch", "assets"] {
        assert!(
            description.contains(space),
            "the plugin description should name the {space} space"
        );
    }
}

#[test]
fn the_marketplace_points_at_the_bundled_plugin() {
    let json = read_json(MARKETPLACE);
    assert_eq!(json["name"], "shards");
    assert!(!json["owner"]["name"]
        .as_str()
        .unwrap_or_default()
        .is_empty());
    assert!(!json["metadata"]["description"]
        .as_str()
        .unwrap_or_default()
        .is_empty());
    let plugins = json["plugins"].as_array().expect("a plugins array");
    assert_eq!(plugins.len(), 1, "exactly one plugin is published");
    assert_eq!(plugins[0]["name"], "shards");
    assert_eq!(plugins[0]["source"], "./plugins/shards");
    assert!(
        repo_root().join("plugins/shards").is_dir(),
        "the marketplace source path resolves on disk"
    );
}

#[test]
fn exactly_one_skill_ships_with_the_plugin() {
    let dir = repo_root().join("plugins/shards/skills");
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .expect("skills dir")
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    assert_eq!(names, vec!["shards".to_string()]);
}

#[test]
fn the_developer_skill_set_is_untouched() {
    assert!(
        repo_root().join(".agents/skills/spec/SKILL.md").is_file(),
        "the vendored `spec` dev skill must stay in place"
    );
    let link = repo_root().join(".claude/skills/spec");
    let meta = std::fs::symlink_metadata(&link).expect("`.claude/skills/spec` exists");
    assert!(
        meta.file_type().is_symlink(),
        "`.claude/skills/spec` must stay a symlink"
    );
    assert!(link.join("SKILL.md").is_file(), "the symlink must resolve");
}

// ---------------------------------------------------------------------------------------
// SKILL.md frontmatter and the tool table
// ---------------------------------------------------------------------------------------

#[test]
fn skill_frontmatter_stays_inside_the_six_field_spec() {
    let skill = Skill::load();
    let allowed: BTreeSet<&str> = [
        "name",
        "description",
        "license",
        "compatibility",
        "metadata",
        "allowed-tools",
    ]
    .into_iter()
    .collect();
    for key in skill.keys() {
        assert!(
            allowed.contains(key.as_str()),
            "SKILL.md frontmatter key `{key}` is outside the claude.ai six-field spec"
        );
    }
    assert!(skill.frontmatter.starts_with("name: shards\n"));
}

#[test]
fn allowed_tools_is_every_non_destructive_tool_and_nothing_else() {
    let skill = Skill::load();
    let allowed: Vec<String> = skill.allowed_tools();
    let destructive: BTreeSet<&str> = shards::mcp::DESTRUCTIVE_TOOLS.into_iter().collect();

    assert_eq!(
        destructive,
        BTreeSet::from(["shards_task_cancel"]),
        "exactly one tool may carry destructiveHint"
    );

    let registered: BTreeSet<&str> = shards::mcp::TOOL_NAMES.into_iter().collect();
    for name in &allowed {
        assert!(
            registered.contains(name.as_str()),
            "allowed-tools names `{name}`, which is not a registered MCP tool"
        );
        assert!(
            !destructive.contains(name.as_str()),
            "allowed-tools must be disjoint from the destructive set, but names `{name}`"
        );
    }

    let allowed_set: BTreeSet<&str> = allowed.iter().map(String::as_str).collect();
    let expected: BTreeSet<&str> = registered.difference(&destructive).copied().collect();
    assert_eq!(
        allowed_set, expected,
        "allowed-tools must be exactly the non-destructive tools"
    );
    assert_eq!(allowed.len(), shards::mcp::TOOL_NAMES.len() - 1);
    assert_eq!(allowed.len(), 39);
}

#[test]
fn no_registered_tool_name_reaches_a_withheld_verb() {
    for name in shards::mcp::TOOL_NAMES {
        for banned in ["delete", "daemon", "reindex", "status", "forget", "remove"] {
            assert!(
                !name.contains(banned),
                "tool `{name}` contains the withheld substring `{banned}`"
            );
        }
    }
    for withheld in [
        "shards_note_delete",
        "shards_task_delete",
        "shards_memory_forget",
        "shards_scratch_clear",
        "shards_asset_remove",
        "shards_asset_add",
        "shards_asset_gc",
        "shards_init",
        "shards_config",
        "shards_watch",
    ] {
        assert!(
            !shards::mcp::TOOL_NAMES.contains(&withheld),
            "`{withheld}` must not be a registered tool"
        );
    }
}

// ---------------------------------------------------------------------------------------
// SKILL.md body
// ---------------------------------------------------------------------------------------

#[test]
fn the_skill_states_all_eight_rules() {
    let body = Skill::load().body.to_lowercase();
    for rule in [
        "search before you write",
        "append rather than fork a near-duplicate",
        "tag from the existing vocabulary",
        "link when a note continues another",
        "claim before you work",
        "always finish with an outcome",
        "cancel is for tasks that shouldn't exist",
        "put it in the space it belongs to",
    ] {
        assert!(body.contains(rule), "SKILL.md is missing the rule: {rule}");
    }
    for space in ["**note**", "**memory**", "**scratch**", "**asset**"] {
        assert!(
            Skill::load().body.contains(space),
            "the which-space-wins rule must cover {space}"
        );
    }
}

#[test]
fn the_skill_carries_no_authorization_language() {
    let text = Skill::load().text.to_lowercase();
    for banned in [
        "permission",
        "permit",
        "authoriz",
        "unauthoriz",
        "access denied",
        "forbidden",
        "not allowed",
        "enforc",
        "restrict",
        "privilege",
        "grant",
        "credential",
    ] {
        assert!(
            !text.contains(banned),
            "SKILL.md must not read as an authorisation decision, but contains `{banned}`"
        );
    }
}

#[test]
fn the_skill_names_no_notes_application() {
    for rel in [SKILL, PLUGIN_JSON, MARKETPLACE] {
        let text = read(rel).to_lowercase();
        for product in ["obsidian", "tolaria", "notion", "logseq"] {
            assert!(
                !text.contains(product),
                "{rel} must not read as \"you need {product}\""
            );
        }
    }
}

#[test]
fn the_skill_does_not_reproduce_the_live_config_block() {
    let body = Skill::load().body;
    for header in ["## Your identity", "## Valid owners", "## Vault\n"] {
        assert!(
            !body.contains(header),
            "the instructions block owns `{header}`; SKILL.md must not duplicate it"
        );
    }
}

#[test]
fn the_skill_describes_the_tag_grammar_correctly() {
    let body = Skill::load().body;
    assert!(body.contains("merges"));
    assert!(body.contains("+x,-y"));
    assert!(body.contains("=x,y"));
    assert!(body.contains("removes exactly the tags you name"));
    assert!(body.contains("left out of the new list is discarded"));
    assert!(
        !body.contains("only form that drops anything"),
        "regression: `+x,-y` also drops tags"
    );
}

// ---------------------------------------------------------------------------------------
// SKILL.md vs the live clap tree
// ---------------------------------------------------------------------------------------

/// The verb families the command-surface section must document, in `{a,b,c}` form.
const EXPECTED_FAMILIES: [&str; 6] = ["note", "task", "memory", "scratch", "asset", "config"];

/// Top-level leaves the command-surface section must name.
const EXPECTED_LEAVES: [&str; 8] = [
    "search",
    "recent-activity",
    "build-context",
    "graph",
    "project",
    "session-start",
    "init",
    "watch",
];

#[test]
fn every_command_group_the_skill_names_exists_in_the_clap_tree() {
    let skill = Skill::load();
    let groups = skill.command_groups();
    let families: BTreeSet<String> = groups.iter().map(|(f, _)| f.clone()).collect();
    assert_eq!(
        families,
        EXPECTED_FAMILIES.iter().map(|s| s.to_string()).collect(),
        "the command-surface section must document exactly the five spaces plus config"
    );

    let root = subcommands(&[]);
    for (family, subs) in groups {
        assert!(
            root.contains(&family),
            "SKILL.md names the `{family}` family, which the CLI does not have"
        );
        let live = subcommands(&[family.as_str()]);
        for sub in subs {
            assert!(
                live.contains(&sub),
                "SKILL.md names `shards {family} {sub}`, which the CLI does not have"
            );
        }
    }
}

#[test]
fn every_leaf_command_the_skill_names_exists_in_the_clap_tree() {
    let section = Skill::load().command_surface().to_string();
    let root = subcommands(&[]);
    for leaf in EXPECTED_LEAVES {
        assert!(
            section.contains(&format!("`{leaf}"))
                || section.contains(&format!("`shards {leaf}"))
                || section.contains(leaf),
            "SKILL.md's command surface must name `{leaf}`"
        );
        assert!(
            root.contains(leaf),
            "SKILL.md names `{leaf}`, which the CLI does not have"
        );
    }
}

#[test]
fn every_flag_the_skill_names_exists_on_that_command() {
    let body = Skill::load().body;
    let checks: [(&[&str], &str); 12] = [
        (&["task", "list"], "--stale"),
        (&["task", "list"], "--available"),
        (&["task", "list"], "--ready"),
        (&["task", "list"], "--blocked"),
        (&["task", "claim"], "--strict"),
        (&["task", "finish"], "--outcome"),
        (&["task", "block"], "--on"),
        (&["task", "unblock"], "--all"),
        (&["task", "next"], "--claim"),
        (&["memory", "recall"], "--no-decay"),
        (&["graph"], "--direction"),
        (&["session-start"], "--team"),
    ];
    for (path, flag) in checks {
        assert!(
            body.contains(flag),
            "SKILL.md should mention `{flag}` (for `shards {}`)",
            path.join(" ")
        );
        assert!(
            help_for(path).contains(flag),
            "`shards {} --help` no longer offers `{flag}`, but SKILL.md names it",
            path.join(" ")
        );
    }
    // The scratch/asset flags the playbook leans on.
    assert!(body.contains("--agent"));
    assert!(help_for(&["scratch", "list"]).contains("--agent"));
    assert!(body.contains("--attach"));
    assert!(help_for(&["asset", "add"]).contains("--attach"));
}

// ---------------------------------------------------------------------------------------
// config.example.toml
// ---------------------------------------------------------------------------------------

#[test]
fn the_example_config_loads_through_from_table() {
    let dir = tempfile::tempdir().expect("tempdir");
    let vault = dir.path().join("vault");
    std::fs::create_dir_all(&vault).expect("create vault");

    let text = read("config.example.toml").replace("~/shards-vault", &vault.to_string_lossy());
    let table: toml::Table = text.parse().expect("config.example.toml is valid TOML");
    let cfg = shards::config::from_table(&table, None).expect("config.example.toml loads");

    if std::env::var("SHARDS_VAULT").is_err() {
        assert_eq!(cfg.vault(), shards::storage::realpath(&vault));
    }
    if std::env::var("SHARDS_AGENT").is_err() {
        assert_eq!(cfg.agent(), Some("my-agent"));
    }
    assert_eq!(cfg.search.collection.as_deref(), Some("my-vault"));
    assert!(cfg.search.hybrid);
    assert_eq!(cfg.search.engine, "auto");
    assert_eq!(
        cfg.search.spaces,
        vec!["notes", "tasks", "memories", "assets"]
    );
    assert_eq!(cfg.tasks.collections, vec!["my-agent", "another-agent"]);
    assert!(!cfg.tasks.strict);

    // The threshold key is documented but deliberately commented out: `--threshold` and the
    // engine floor must keep working, which they only do while it is not explicit.
    assert!(
        !cfg.search.threshold_explicit,
        "config.example.toml must leave [search].threshold unset"
    );
    assert!((cfg.search.threshold - 0.65).abs() < f64::EPSILON);

    // Every space resolves, and none is disabled. The loader canonicalises `vault_path`,
    // so the comparison must speak the same path space (on macOS a tempdir is `/var/...`,
    // canonicalised to `/private/var/...`).
    // `SHARDS_VAULT` may override the vault, so compare against the one the loader resolved.
    let vault_real = cfg.vault().to_path_buf();
    for space in shards::spaces::Space::ALL {
        let root = cfg.root(space).expect("every example space is enabled");
        assert!(root.starts_with(&vault_real) || root == vault_real);
    }
}

#[test]
fn the_example_config_documents_every_key_the_loader_reads() {
    let text = read("config.example.toml");
    for key in [
        "[core]",
        "vault_path",
        "agent",
        "[spaces]",
        "notes",
        "tasks",
        "memories",
        "scratch",
        "assets",
        "[search]",
        "collection",
        "hybrid",
        "threshold",
        "engine",
        "spaces",
        "[tasks]",
        "collections",
        "strict",
    ] {
        assert!(
            text.contains(key),
            "config.example.toml never mentions {key}"
        );
    }
}
