/// Small POSIX word scanner for cooperative command classification, never execution.
pub fn words(command: &str, separators: bool) -> Option<Vec<String>> {
    let mut result = Vec::new();
    let mut word = String::new();
    let mut quote = None;
    let mut escaped = false;
    let mut present = false;
    for ch in command.chars() {
        if escaped {
            word.push(ch);
            escaped = false;
            present = true;
            continue;
        }
        if ch == '\\' && quote != Some('\'') {
            escaped = true;
            continue;
        }
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            } else {
                word.push(ch);
            }
            present = true;
            continue;
        }
        if ch == '\'' || ch == '"' {
            quote = Some(ch);
            present = true;
        } else if separators && ";&|()\n".contains(ch) {
            if present {
                result.push(std::mem::take(&mut word));
                present = false;
            }
            result.push(";".into());
        } else if ch.is_whitespace() {
            if present {
                result.push(std::mem::take(&mut word));
                present = false;
            }
        } else {
            word.push(ch);
            present = true;
        }
    }
    if quote.is_some() || escaped {
        return None;
    }
    if present {
        result.push(word);
    }
    Some(result)
}

fn basename(text: &str) -> &str {
    text.rsplit('/').next().unwrap_or(text)
}

pub fn invokes_operator_grant(command: &str) -> bool {
    classify(command, 0)
}
fn classify(command: &str, depth: usize) -> bool {
    if depth > 16 {
        return false;
    }
    let Some(tokens) = words(command, true) else {
        return false;
    };
    for segment in tokens.split(|token| token == ";") {
        let mut argv = segment;
        while let Some(first) = argv.first() {
            match basename(first) {
                "command"
                    if argv
                        .get(1)
                        .is_some_and(|v| matches!(v.as_str(), "-v" | "-V")) =>
                {
                    argv = &[];
                }
                "sudo" => {
                    argv = &argv[1..];
                    while let Some(option) = argv.first().filter(|v| v.starts_with('-')) {
                        let count = if matches!(
                            option.as_str(),
                            "-u" | "--user"
                                | "-g"
                                | "--group"
                                | "-h"
                                | "--host"
                                | "-p"
                                | "--prompt"
                                | "-C"
                                | "--close-from"
                                | "-T"
                                | "--command-timeout"
                                | "-R"
                                | "--chroot"
                                | "-D"
                                | "--chdir"
                        ) {
                            2
                        } else {
                            1
                        };
                        argv = argv.get(count..).unwrap_or_default();
                    }
                }
                "command" | "exec" => {
                    argv = &argv[1..];
                    while argv.first().is_some_and(|v| v.starts_with('-')) {
                        argv = &argv[1..];
                    }
                }
                "env" => {
                    argv = &argv[1..];
                    while let Some(option) = argv.first().filter(|v| v.starts_with('-')) {
                        let count = if matches!(option.as_str(), "-u" | "--unset") {
                            2
                        } else {
                            1
                        };
                        argv = argv.get(count..).unwrap_or_default();
                    }
                }
                _ if first.contains('=') => argv = &argv[1..],
                _ => break,
            }
        }
        let Some(executable) = argv.first() else {
            continue;
        };
        if matches!(basename(executable), "sh" | "bash" | "zsh") {
            for pair in argv[1..].windows(2) {
                if pair[0].starts_with('-')
                    && pair[0].contains('c')
                    && classify(&pair[1], depth + 1)
                {
                    return true;
                }
            }
        }
        if basename(executable) == "shards-harness"
            && argv[1..]
                .iter()
                .any(|v| v == "--operator-exception" || v.starts_with("--operator-exception="))
        {
            return true;
        }
    }
    false
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_native_grants_through_wrappers() {
        for command in [
            "shards-harness --operator-exception id --reason yes",
            "env A=b command /tmp/bin/shards-harness --operator-exception=id",
            "bash -lc 'sudo shards-harness --operator-exception id'",
            "sudo -u operator -- shards-harness --operator-exception id",
            "true; exec shards-harness --operator-exception id",
        ] {
            assert!(invokes_operator_grant(command), "{command}");
        }
    }
    #[test]
    fn literal_search_read_and_test_are_work() {
        for command in [
            "rg --operator-exception harness.rs",
            "cat shards-harness --operator-exception",
            "test shards-harness = --operator-exception",
            "shards-harness --version",
            "echo '--operator-exception'",
            "command -v shards-harness --operator-exception",
        ] {
            assert!(!invokes_operator_grant(command), "{command}");
        }
    }
}
