use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
type Result<T> = std::result::Result<T, String>;

/// Parse structure ourselves so arbitrary-precision numeric sentinels cannot
/// coerce a user object. serde_json still validates every scalar token/string.
struct Parser<'a> {
    raw: &'a str,
    at: usize,
}
impl Parser<'_> {
    fn whitespace(&mut self) {
        while self
            .raw
            .as_bytes()
            .get(self.at)
            .is_some_and(|b| matches!(b, b' ' | b'\t' | b'\r' | b'\n'))
        {
            self.at += 1;
        }
    }
    fn byte(&self) -> Option<u8> {
        self.raw.as_bytes().get(self.at).copied()
    }
    fn string(&mut self) -> Result<String> {
        let start = self.at;
        if self.byte() != Some(b'"') {
            return Err("expected JSON string".into());
        }
        self.at += 1;
        loop {
            match self.byte() {
                Some(b'"') => {
                    self.at += 1;
                    let token = self
                        .raw
                        .get(start..self.at)
                        .ok_or("invalid string boundary")?;
                    return serde_json::from_str(token).map_err(|e| e.to_string());
                }
                Some(b'\\') => {
                    self.at += 2;
                }
                Some(_) => self.at += 1,
                None => return Err("unterminated JSON string".into()),
            }
        }
    }
    fn value(&mut self, depth: usize) -> Result<Value> {
        if depth > 128 {
            return Err("JSON nesting exceeds limit".into());
        }
        self.whitespace();
        match self.byte() {
            Some(b'"') => self.string().map(Value::String),
            Some(b'{') => {
                self.at += 1;
                self.whitespace();
                let mut map = Map::new();
                if self.byte() == Some(b'}') {
                    self.at += 1;
                    return Ok(Value::Object(map));
                }
                loop {
                    self.whitespace();
                    let key = self.string()?;
                    self.whitespace();
                    if self.byte() != Some(b':') {
                        return Err("expected JSON colon".into());
                    }
                    self.at += 1;
                    if map.contains_key(&key) {
                        return Err(format!("duplicate JSON key: {key}"));
                    }
                    map.insert(key, self.value(depth + 1)?);
                    self.whitespace();
                    match self.byte() {
                        Some(b',') => self.at += 1,
                        Some(b'}') => {
                            self.at += 1;
                            break;
                        }
                        _ => return Err("expected JSON comma or object end".into()),
                    }
                }
                Ok(Value::Object(map))
            }
            Some(b'[') => {
                self.at += 1;
                self.whitespace();
                let mut out = Vec::new();
                if self.byte() == Some(b']') {
                    self.at += 1;
                    return Ok(Value::Array(out));
                }
                loop {
                    out.push(self.value(depth + 1)?);
                    self.whitespace();
                    match self.byte() {
                        Some(b',') => self.at += 1,
                        Some(b']') => {
                            self.at += 1;
                            break;
                        }
                        _ => return Err("expected JSON comma or array end".into()),
                    }
                }
                Ok(Value::Array(out))
            }
            Some(_) => {
                let start = self.at;
                while self.byte().is_some_and(|b| {
                    !matches!(b, b' ' | b'\t' | b'\r' | b'\n' | b',' | b']' | b'}')
                }) {
                    self.at += 1;
                }
                let token = self
                    .raw
                    .get(start..self.at)
                    .ok_or("invalid token boundary")?;
                match token {
                    "true" => Ok(Value::Bool(true)),
                    "false" => Ok(Value::Bool(false)),
                    "null" => Ok(Value::Null),
                    _ => {
                        let number = token
                            .parse::<serde_json::Number>()
                            .map_err(|e| e.to_string())?;
                        if token.contains(['.', 'e', 'E']) && number.as_f64().is_none() {
                            return Err("nonfinite JSON number".into());
                        }
                        Ok(Value::Number(number))
                    }
                }
            }
            None => Err("missing JSON value".into()),
        }
    }
}
pub fn strict_json(raw: &str) -> Result<Value> {
    let mut parser = Parser { raw, at: 0 };
    let value = parser
        .value(0)
        .map_err(|e| format!("invalid JSON; repair runtime state: {e}"))?;
    parser.whitespace();
    if parser.at != raw.len() {
        return Err("trailing JSON content".into());
    }
    Ok(value)
}
fn string_ascii(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\x08' => out.push_str("\\b"),
            '\x0c' => out.push_str("\\f"),
            c if (' '..='~').contains(&c) => out.push(c),
            c => {
                let mut units = [0u16; 2];
                for u in c.encode_utf16(&mut units) {
                    out.push_str(&format!("\\u{u:04x}"));
                }
            }
        }
    }
    out.push('"');
    out
}
fn number_python(n: &serde_json::Number) -> Result<String> {
    let source = n.to_string();
    if !source.contains(['.', 'e', 'E']) {
        return Ok(if source == "-0" { "0".into() } else { source });
    }
    let f = n.as_f64().ok_or("invalid JSON number")?;
    // Rust's shortest Debug representation uses the same shortest-roundtrip
    // digits as Python; normalize Python's exponent threshold and spelling.
    let raw = format!("{f:?}");
    let mut parts = raw.split(['e', 'E']);
    let mantissa = parts.next().ok_or("invalid float")?;
    let exponent = parts.next();
    if let Some(e) = exponent {
        let exp = e.parse::<i32>().map_err(|e| e.to_string())?;
        let sign = if exp < 0 { '-' } else { '+' };
        return Ok(format!("{mantissa}e{sign}{:02}", exp.abs()));
    }
    if f != 0.0 && (f.abs() >= 1e16 || f.abs() < 1e-4) {
        let sci = format!("{f:e}");
        let (m, e) = sci.split_once('e').ok_or("invalid float exponent")?;
        let exp = e.parse::<i32>().map_err(|e| e.to_string())?;
        return Ok(format!(
            "{m}e{}{:02}",
            if exp < 0 { '-' } else { '+' },
            exp.abs()
        ));
    }
    Ok(raw)
}
pub fn canonical_json(v: &Value) -> Result<String> {
    Ok(match v {
        Value::Null => "null".into(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => number_python(n)?,
        Value::String(s) => string_ascii(s),
        Value::Array(a) => format!(
            "[{}]",
            a.iter()
                .map(canonical_json)
                .collect::<Result<Vec<_>>>()?
                .join(",")
        ),
        Value::Object(m) => {
            let mut keys = m.keys().collect::<Vec<_>>();
            keys.sort();
            let mut fields = Vec::new();
            for k in keys {
                fields.push(format!("{}:{}", string_ascii(k), canonical_json(&m[k])?));
            }
            format!("{{{}}}", fields.join(","))
        }
    })
}
pub fn text_digest(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
pub fn digest(v: &Value) -> Result<String> {
    Ok(text_digest(&canonical_json(v)?))
}
#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    #[test]
    fn rejects_nested_duplicate_keys() {
        assert!(strict_json(r#"{"a":[{"b":1,"b":2}]}"#).is_err());
    }
    #[test]
    fn python_ascii_numeric_golden() {
        let value = serde_json::json!({"é":"😀\n","x":[1.0,1e-7,1e20,-0.0],"a":true});
        assert_eq!(
            canonical_json(&value).unwrap(),
            r#"{"a":true,"x":[1.0,1e-07,1e+20,-0.0],"\u00e9":"\ud83d\ude00\n"}"#
        );
    }
}
