//! Private RPC envelopes. Control failures never masquerade as core domain errors.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const MAX_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_DURATION_MS: i64 = 30_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Operation {
    Probe,
    Describe,
    Call,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Execution {
    NotStarted,
    Unknown,
    Completed,
}

#[derive(Debug, Clone)]
pub struct ControlError {
    pub kind: &'static str,
    pub message: &'static str,
    pub status: u16,
    pub execution: Execution,
    pub request_id: Option<String>,
}

impl ControlError {
    pub fn new(
        kind: &'static str,
        message: &'static str,
        status: u16,
        execution: Execution,
    ) -> Self {
        Self {
            kind,
            message,
            status,
            execution,
            request_id: None,
        }
    }
    fn for_request(mut self, id: &str) -> Self {
        self.request_id = Some(id.to_string());
        self
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Meta {
    pub v: u32,
    pub request_id: String,
    pub vault_id: String,
    pub deadline_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Call {
    pub v: u32,
    pub request_id: String,
    pub vault_id: String,
    pub deadline_ms: i64,
    pub tool: String,
    pub arguments: Map<String, Value>,
}

#[derive(Debug, Clone)]
pub struct Request {
    pub meta: Meta,
    pub call: Option<Call>,
}

pub fn parse(
    operation: Operation,
    body: &[u8],
    vault: &str,
    now: i64,
) -> Result<Request, ControlError> {
    let invalid = || {
        ControlError::new(
            "invalid_request",
            "invalid private request",
            400,
            Execution::NotStarted,
        )
    };
    if body.len() > MAX_BYTES {
        return Err(ControlError::new(
            "payload_too_large",
            "request exceeds the size limit",
            413,
            Execution::NotStarted,
        ));
    }
    let request = if operation == Operation::Call {
        let call: Call = serde_json::from_slice(body).map_err(|_| invalid())?;
        let meta = Meta {
            v: call.v,
            request_id: call.request_id.clone(),
            vault_id: call.vault_id.clone(),
            deadline_ms: call.deadline_ms,
        };
        Request {
            meta,
            call: Some(call),
        }
    } else {
        Request {
            meta: serde_json::from_slice(body).map_err(|_| invalid())?,
            call: None,
        }
    };
    let id = request.meta.request_id.as_bytes();
    if id.len() != 36
        || !id.iter().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                *byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
    {
        return Err(invalid());
    }
    if request.meta.v != 1 {
        return Err(ControlError::new(
            "version_mismatch",
            "unsupported private protocol",
            409,
            Execution::NotStarted,
        )
        .for_request(&request.meta.request_id));
    }
    if request.meta.vault_id != vault {
        return Err(ControlError::new(
            "vault_mismatch",
            "configured vault does not match",
            409,
            Execution::NotStarted,
        )
        .for_request(&request.meta.request_id));
    }
    if request.meta.deadline_ms <= now {
        return Err(ControlError::new(
            "deadline_exceeded",
            "request deadline elapsed before execution",
            504,
            Execution::NotStarted,
        )
        .for_request(&request.meta.request_id));
    }
    Ok(request)
}
