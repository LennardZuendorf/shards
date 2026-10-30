use shards_gateway::protocol::{parse, Execution, Operation, MAX_BYTES};

const NOW: i64 = 1_800_000_000_000;

fn request(extra: &str) -> Vec<u8> {
    format!(
        "{{\"v\":1,\"request_id\":\"01234567-89ab-cdef-0123-456789abcdef\",\"vault_id\":\"test-vault\",\"deadline_ms\":{}{extra}}}",
        NOW + 5_000
    )
    .into_bytes()
}

#[test]
fn valid_probe_describe_and_call_have_distinct_shapes() {
    assert!(parse(Operation::Probe, &request(""), "test-vault", NOW).is_ok());
    assert!(parse(Operation::Describe, &request(""), "test-vault", NOW).is_ok());
    let call = request(",\"tool\":\"shards_task_get\",\"arguments\":{\"id\":\"t-fixture\"}");
    assert!(parse(Operation::Call, &call, "test-vault", NOW).is_ok());
    assert_eq!(
        parse(Operation::Probe, &call, "test-vault", NOW)
            .unwrap_err()
            .kind,
        "invalid_request"
    );
}

#[test]
fn malformed_or_spoofed_envelopes_never_start_work() {
    let valid = ",\"tool\":\"shards_task_get\",\"arguments\":{\"id\":\"t-fixture\"}";
    assert!(parse(Operation::Call, &request(valid), "test-vault", NOW).is_ok());
    for body in [
        request(&format!("{valid},\"actor\":\"other\"")),
        request(&format!("{valid},\"scopes\":[\"tasks:write\"]")),
        b"[]".to_vec(),
        request(",\"tool\":1,\"arguments\":{}"),
        request(",\"tool\":\"shards_task_get\",\"arguments\":[]"),
    ] {
        let error = parse(Operation::Call, &body, "test-vault", NOW).unwrap_err();
        assert_eq!(error.kind, "invalid_request");
        assert_eq!(error.execution, Execution::NotStarted);
    }
}

#[test]
fn version_vault_and_deadline_failures_are_distinct() {
    let body = request("");
    assert_eq!(
        parse(Operation::Describe, &body, "wrong-vault", NOW)
            .unwrap_err()
            .kind,
        "vault_mismatch"
    );
    assert_eq!(
        parse(Operation::Describe, &body, "test-vault", NOW + 5_000)
            .unwrap_err()
            .kind,
        "deadline_exceeded"
    );
    let version = String::from_utf8(body)
        .unwrap()
        .replacen("\"v\":1", "\"v\":2", 1);
    assert_eq!(
        parse(Operation::Describe, version.as_bytes(), "test-vault", NOW)
            .unwrap_err()
            .kind,
        "version_mismatch"
    );
}

#[test]
fn request_size_is_bounded_before_json_parsing() {
    let oversized = vec![b' '; MAX_BYTES + 1];
    let error = parse(Operation::Probe, &oversized, "test-vault", NOW).unwrap_err();
    assert_eq!(error.kind, "payload_too_large");
    assert_eq!(error.status, 413);
    assert_eq!(error.execution, Execution::NotStarted);
}

#[test]
fn invalid_correlation_id_is_refused_without_echoing_it() {
    let body = String::from_utf8(request(""))
        .unwrap()
        .replace("01234567-89ab-cdef-0123-456789abcdef", "secret-or-title");
    assert_eq!(
        parse(Operation::Probe, body.as_bytes(), "test-vault", NOW)
            .unwrap_err()
            .kind,
        "invalid_request"
    );
}
