//! Task calendar values and recurrence (task-model-v2).
//!
//! `due` is a floating calendar value (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, never a zone),
//! `deadline` a bare date, and `recur` an RFC 5545 RRULE subset: `FREQ` (DAILY, WEEKLY,
//! MONTHLY, YEARLY), `INTERVAL`, `BYDAY` (weekly only), `BYMONTH` (yearly only) and
//! `BYMONTHDAY` (monthly, or yearly together with `BYMONTH`). A day that does not exist in a
//! month clamps to that month's last day (Todoist's end-of-month rule, not RFC 5545's skip).
//!
//! Every function here is pure: "today" is always a parameter, so the clock stays in
//! `timefmt` and every rule is unit-testable.

use std::fmt;

use chrono::{Datelike, Duration, NaiveDate, NaiveTime, Timelike, Weekday};

use crate::error::{Result, ShardsError};
use crate::fm::{Ts, TsValue, Value};
use crate::timefmt::parse_iso_lenient;

/// The two anchors a recurring task advances from.
pub const RECUR_FROM_VALUES: [&str; 2] = ["due", "completion"];

/// The RRULE parts the subset accepts.
const RRULE_PARTS: [&str; 5] = ["FREQ", "INTERVAL", "BYDAY", "BYMONTH", "BYMONTHDAY"];

/// The largest `INTERVAL` accepted — a guard against a typo, not a product limit.
const MAX_INTERVAL: u32 = 1000;

/// How many periods past the skip-ahead estimate the search may walk. Every supported rule
/// yields at least one occurrence per period, so two suffice; the slack is defensive.
const PERIOD_SLACK: u32 = 8;

// ---------------------------------------------------------------------------------------
// due / deadline
// ---------------------------------------------------------------------------------------

/// A `due` value: a calendar date plus an optional floating wall-clock time.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Due {
    pub date: NaiveDate,
    pub time: Option<NaiveTime>,
}

impl Due {
    /// Parse a `due` write value: exactly `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`.
    pub fn parse(value: &str) -> Result<Due> {
        let text = value.trim();
        let invalid = || {
            ShardsError::Validation(format!(
                "invalid due: '{text}' (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)"
            ))
        };
        let chars: Vec<char> = text.chars().collect();
        match chars.len() {
            10 => Ok(Due {
                date: strict_date(&chars).ok_or_else(invalid)?,
                time: None,
            }),
            16 => {
                let date = strict_date(chars.get(..10).ok_or_else(invalid)?).ok_or_else(invalid)?;
                if chars.get(10) != Some(&'T') {
                    return Err(invalid());
                }
                let time = strict_time(chars.get(11..).ok_or_else(invalid)?).ok_or_else(invalid)?;
                Ok(Due {
                    date,
                    time: Some(time),
                })
            }
            _ => Err(invalid()),
        }
    }

    /// Read a stored `due` leniently: any date or datetime scalar the loader recognises,
    /// quoted or not. An offset datetime keeps its local wall clock. Anything else is `None`.
    pub fn from_value(value: &Value) -> Option<Due> {
        let parsed = match value {
            Value::Ts(ts) => ts.value,
            Value::Str(s) => parse_iso_lenient(s)?,
            _ => return None,
        };
        Some(match parsed {
            TsValue::Date(date) => Due { date, time: None },
            TsValue::Naive(dt) => Due {
                date: dt.date(),
                time: Some(dt.time()),
            },
            TsValue::Offset(dt) => {
                let local = dt.naive_local();
                Due {
                    date: local.date(),
                    time: Some(local.time()),
                }
            }
        })
    }

    /// The frontmatter value we write: an unquoted timestamp scalar in canonical spelling.
    pub fn to_value(self) -> Value {
        let raw = self.to_string();
        let parsed = match self.time {
            None => TsValue::Date(self.date),
            Some(time) => TsValue::Naive(self.date.and_time(time)),
        };
        Value::Ts(Ts::new(raw, parsed))
    }

    /// The same wall-clock time on another date.
    pub fn on(self, date: NaiveDate) -> Due {
        Due {
            date,
            time: self.time,
        }
    }
}

impl fmt::Display for Due {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", date_text(self.date))?;
        if let Some(time) = self.time {
            write!(f, "T{:02}:{:02}", time.hour(), time.minute())?;
        }
        Ok(())
    }
}

/// Parse a `deadline` write value: exactly `YYYY-MM-DD`.
pub fn parse_deadline(value: &str) -> Result<NaiveDate> {
    let text = value.trim();
    let chars: Vec<char> = text.chars().collect();
    strict_date(&chars)
        .filter(|_| chars.len() == 10)
        .ok_or_else(|| {
            ShardsError::Validation(format!("invalid deadline: '{text}' (use YYYY-MM-DD)"))
        })
}

/// Parse a filter date (`--due-before`, `--due-after`): exactly `YYYY-MM-DD`.
pub fn parse_filter_date(flag: &str, value: &str) -> Result<NaiveDate> {
    let text = value.trim();
    let chars: Vec<char> = text.chars().collect();
    strict_date(&chars)
        .filter(|_| chars.len() == 10)
        .ok_or_else(|| {
            ShardsError::Validation(format!("invalid {flag}: '{text}' (use YYYY-MM-DD)"))
        })
}

/// Read a stored `deadline` leniently: the date part of any date or datetime scalar.
pub fn deadline_from_value(value: &Value) -> Option<NaiveDate> {
    Due::from_value(value).map(|d| d.date)
}

/// The frontmatter value for a deadline date.
pub fn date_value(date: NaiveDate) -> Value {
    Value::Ts(Ts::new(date_text(date), TsValue::Date(date)))
}

/// `YYYY-MM-DD`.
pub fn date_text(date: NaiveDate) -> String {
    format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day())
}

/// `YYYY-MM-DD` with fixed separators and every other position an ASCII digit.
fn strict_date(chars: &[char]) -> Option<NaiveDate> {
    if chars.len() != 10 {
        return None;
    }
    for (i, c) in chars.iter().enumerate() {
        let ok = if i == 4 || i == 7 {
            *c == '-'
        } else {
            c.is_ascii_digit()
        };
        if !ok {
            return None;
        }
    }
    let text: String = chars.iter().collect();
    NaiveDate::parse_from_str(&text, "%Y-%m-%d").ok()
}

/// `HH:MM` with a fixed separator and every other position an ASCII digit.
fn strict_time(chars: &[char]) -> Option<NaiveTime> {
    if chars.len() != 5 {
        return None;
    }
    for (i, c) in chars.iter().enumerate() {
        let ok = if i == 2 {
            *c == ':'
        } else {
            c.is_ascii_digit()
        };
        if !ok {
            return None;
        }
    }
    let text: String = chars.iter().collect();
    NaiveTime::parse_from_str(&text, "%H:%M").ok()
}

/// Validate a `recur_from` write value.
pub fn validate_recur_from(value: &str) -> Result<()> {
    if RECUR_FROM_VALUES.contains(&value) {
        Ok(())
    } else {
        Err(ShardsError::Validation(format!(
            "invalid recur_from: '{value}' (use {})",
            RECUR_FROM_VALUES.join(", ")
        )))
    }
}

// ---------------------------------------------------------------------------------------
// the RRULE subset
// ---------------------------------------------------------------------------------------

/// The four supported frequencies.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Freq {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

impl Freq {
    fn name(self) -> &'static str {
        match self {
            Freq::Daily => "DAILY",
            Freq::Weekly => "WEEKLY",
            Freq::Monthly => "MONTHLY",
            Freq::Yearly => "YEARLY",
        }
    }
}

/// A validated recurrence rule.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rule {
    pub freq: Freq,
    pub interval: u32,
    /// Weekly only; empty means "the anchor's weekday".
    pub byday: Vec<Weekday>,
    /// Yearly only, 1..=12, sorted; empty means "the anchor's month".
    pub bymonth: Vec<u32>,
    /// Monthly, or yearly with `bymonth`; empty means "the anchor's day of month". Negative
    /// counts from the end.
    pub bymonthday: Vec<i32>,
}

impl Rule {
    /// Parse and validate a `recur` value. An optional `RRULE:` prefix is accepted and dropped;
    /// part names and values are case-insensitive. Anything outside the subset is exit 2.
    /// Error messages quote the caller's own spelling, never an uppercased copy.
    pub fn parse(value: &str) -> Result<Rule> {
        let text = value.trim();
        let invalid =
            |why: String| ShardsError::Validation(format!("invalid recur: '{text}' ({why})"));
        let body = match text.split_once(':') {
            Some((prefix, rest)) if prefix.trim().eq_ignore_ascii_case("RRULE") => rest,
            _ => text,
        };
        let mut freq: Option<Freq> = None;
        let mut interval: Option<u32> = None;
        let mut byday: Option<Vec<Weekday>> = None;
        let mut bymonth: Option<Vec<u32>> = None;
        let mut bymonthday: Option<Vec<i32>> = None;
        for part in body.split(';') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let Some((raw_key, raw_val)) = part.split_once('=') else {
                return Err(invalid(format!("expected KEY=VALUE, got '{part}'")));
            };
            let (raw_key, raw_val) = (raw_key.trim(), raw_val.trim());
            let (key, val) = (raw_key.to_ascii_uppercase(), raw_val.to_ascii_uppercase());
            let duplicate = || invalid(format!("{raw_key} given twice"));
            match key.as_str() {
                "FREQ" => {
                    if freq.is_some() {
                        return Err(duplicate());
                    }
                    freq = Some(match val.as_str() {
                        "DAILY" => Freq::Daily,
                        "WEEKLY" => Freq::Weekly,
                        "MONTHLY" => Freq::Monthly,
                        "YEARLY" => Freq::Yearly,
                        _ => {
                            return Err(invalid(format!(
                                "unsupported FREQ '{raw_val}'; use DAILY, WEEKLY, MONTHLY, YEARLY"
                            )))
                        }
                    });
                }
                "INTERVAL" => {
                    if interval.is_some() {
                        return Err(duplicate());
                    }
                    let n: u32 = val
                        .parse()
                        .ok()
                        .filter(|n| (1..=MAX_INTERVAL).contains(n))
                        .ok_or_else(|| {
                            invalid(format!("INTERVAL must be an integer 1..{MAX_INTERVAL}"))
                        })?;
                    interval = Some(n);
                }
                "BYDAY" => {
                    if byday.is_some() {
                        return Err(duplicate());
                    }
                    let mut days: Vec<Weekday> = Vec::new();
                    for token in raw_val.split(',') {
                        let token = token.trim();
                        let day = weekday(&token.to_ascii_uppercase()).ok_or_else(|| {
                            invalid(format!(
                                "BYDAY takes MO, TU, WE, TH, FR, SA, SU; got '{token}'"
                            ))
                        })?;
                        if !days.contains(&day) {
                            days.push(day);
                        }
                    }
                    days.sort_by_key(|d| d.num_days_from_monday());
                    byday = Some(days);
                }
                "BYMONTH" => {
                    if bymonth.is_some() {
                        return Err(duplicate());
                    }
                    let mut months: Vec<u32> = Vec::new();
                    for token in raw_val.split(',') {
                        let token = token.trim();
                        let n: u32 = token
                            .parse()
                            .ok()
                            .filter(|n| (1..=12).contains(n))
                            .ok_or_else(|| {
                                invalid(format!("BYMONTH takes 1..12; got '{token}'"))
                            })?;
                        if !months.contains(&n) {
                            months.push(n);
                        }
                    }
                    months.sort_by_key(|m| *m);
                    bymonth = Some(months);
                }
                "BYMONTHDAY" => {
                    if bymonthday.is_some() {
                        return Err(duplicate());
                    }
                    let mut days: Vec<i32> = Vec::new();
                    for token in raw_val.split(',') {
                        let token = token.trim();
                        let n: i32 = token
                            .parse()
                            .ok()
                            .filter(|n: &i32| *n != 0 && (-31..=31).contains(n))
                            .ok_or_else(|| {
                                invalid(format!("BYMONTHDAY takes 1..31 or -31..-1; got '{token}'"))
                            })?;
                        if !days.contains(&n) {
                            days.push(n);
                        }
                    }
                    bymonthday = Some(days);
                }
                _ => {
                    return Err(invalid(format!(
                        "unsupported part '{raw_key}'; use {}",
                        RRULE_PARTS.join(", ")
                    )))
                }
            }
        }
        let freq = freq.ok_or_else(|| invalid("FREQ is required".to_string()))?;
        if byday.is_some() && freq != Freq::Weekly {
            return Err(invalid(
                "BYDAY is only supported with FREQ=WEEKLY".to_string(),
            ));
        }
        if bymonth.is_some() && freq != Freq::Yearly {
            return Err(invalid(
                "BYMONTH is only supported with FREQ=YEARLY".to_string(),
            ));
        }
        if bymonthday.is_some() {
            match freq {
                Freq::Monthly => {}
                Freq::Yearly if bymonth.is_some() => {}
                // RFC 5545 reads a yearly BYMONTHDAY without BYMONTH as "that day of every
                // month"; the subset only takes the pair, so the two readings never disagree.
                Freq::Yearly => {
                    return Err(invalid(
                        "BYMONTHDAY with FREQ=YEARLY needs BYMONTH".to_string(),
                    ))
                }
                Freq::Daily | Freq::Weekly => {
                    return Err(invalid(
                        "BYMONTHDAY is only supported with FREQ=MONTHLY or FREQ=YEARLY".to_string(),
                    ))
                }
            }
        }
        Ok(Rule {
            freq,
            interval: interval.unwrap_or(1),
            byday: byday.unwrap_or_default(),
            bymonth: bymonth.unwrap_or_default(),
            bymonthday: bymonthday.unwrap_or_default(),
        })
    }

    /// The first occurrence of the series anchored at `anchor` that falls strictly after
    /// `after`. Each candidate is computed from the anchor (never from a previous, clamped
    /// occurrence), so a day-31 or Feb-29 anchor never drifts within one advance.
    pub fn next_after(&self, anchor: NaiveDate, after: NaiveDate) -> Option<NaiveDate> {
        let interval = i64::from(self.interval);
        // Skip ahead to the period that contains `after`, then walk forward.
        let start: i64 = if after <= anchor {
            0
        } else {
            match self.freq {
                Freq::Daily => (after - anchor).num_days() / interval,
                Freq::Weekly => (week_start(after) - week_start(anchor)).num_days() / 7 / interval,
                Freq::Monthly => month_index(after).saturating_sub(month_index(anchor)) / interval,
                Freq::Yearly => i64::from(after.year() - anchor.year()) / interval,
            }
        };
        for period in start..start.saturating_add(i64::from(PERIOD_SLACK)) {
            let offset = period.checked_mul(interval)?;
            let mut candidates = self.period_dates(anchor, offset)?;
            candidates.sort();
            if let Some(hit) = candidates.into_iter().find(|d| *d > after && *d >= anchor) {
                return Some(hit);
            }
        }
        None
    }

    /// The occurrences inside the period `offset` units (days, weeks, months, years) after
    /// the anchor's period.
    fn period_dates(&self, anchor: NaiveDate, offset: i64) -> Option<Vec<NaiveDate>> {
        match self.freq {
            Freq::Daily => Some(vec![anchor.checked_add_signed(Duration::try_days(offset)?)?]),
            Freq::Weekly => {
                let monday = week_start(anchor).checked_add_signed(Duration::try_weeks(offset)?)?;
                let days: Vec<Weekday> = if self.byday.is_empty() {
                    vec![anchor.weekday()]
                } else {
                    self.byday.clone()
                };
                days.iter()
                    .map(|d| {
                        monday.checked_add_signed(Duration::try_days(i64::from(
                            d.num_days_from_monday(),
                        ))?)
                    })
                    .collect()
            }
            Freq::Monthly => {
                let (year, month) = month_from_index(month_index(anchor).checked_add(offset)?)?;
                let mut out: Vec<NaiveDate> = Vec::new();
                self.push_month_days(anchor, year, month, &mut out)?;
                Some(out)
            }
            Freq::Yearly => {
                let year = anchor.year().checked_add(i32::try_from(offset).ok()?)?;
                let months: Vec<u32> = if self.bymonth.is_empty() {
                    vec![anchor.month()]
                } else {
                    self.bymonth.clone()
                };
                let mut out: Vec<NaiveDate> = Vec::new();
                for month in months {
                    self.push_month_days(anchor, year, month, &mut out)?;
                }
                Some(out)
            }
        }
    }
}

impl Rule {
    /// Push this rule's days of `year`-`month` (BYMONTHDAY, or the anchor's day), each clamped
    /// into the month, skipping dates already present.
    fn push_month_days(
        &self,
        anchor: NaiveDate,
        year: i32,
        month: u32,
        out: &mut Vec<NaiveDate>,
    ) -> Option<()> {
        let last = days_in_month(year, month)?;
        let wanted: Vec<i32> = if self.bymonthday.is_empty() {
            vec![i32::try_from(anchor.day()).ok()?]
        } else {
            self.bymonthday.clone()
        };
        for n in wanted {
            let date = NaiveDate::from_ymd_opt(year, month, resolve_month_day(n, last))?;
            if !out.contains(&date) {
                out.push(date);
            }
        }
        Some(())
    }

    /// The same rule with the anchor's calendar position written into it, so a later advance
    /// that starts from a clamped date still knows the day the series was meant to fall on.
    ///
    /// `None` when the rule already names its days, or its frequency never clamps.
    fn pinned_to(&self, anchor: NaiveDate) -> Option<Rule> {
        let day = i32::try_from(anchor.day()).ok()?;
        match self.freq {
            Freq::Monthly if self.bymonthday.is_empty() => Some(Rule {
                bymonthday: vec![day],
                ..self.clone()
            }),
            Freq::Yearly if self.bymonthday.is_empty() => Some(Rule {
                bymonth: if self.bymonth.is_empty() {
                    vec![anchor.month()]
                } else {
                    self.bymonth.clone()
                },
                bymonthday: vec![day],
                ..self.clone()
            }),
            _ => None,
        }
    }
}

impl fmt::Display for Rule {
    /// The canonical spelling stored on disk: `FREQ` first, `INTERVAL` only when above 1.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "FREQ={}", self.freq.name())?;
        if self.interval > 1 {
            write!(f, ";INTERVAL={}", self.interval)?;
        }
        if !self.byday.is_empty() {
            let days: Vec<&str> = self.byday.iter().map(|d| weekday_code(*d)).collect();
            write!(f, ";BYDAY={}", days.join(","))?;
        }
        if !self.bymonth.is_empty() {
            let months: Vec<String> = self.bymonth.iter().map(u32::to_string).collect();
            write!(f, ";BYMONTH={}", months.join(","))?;
        }
        if !self.bymonthday.is_empty() {
            let days: Vec<String> = self.bymonthday.iter().map(i32::to_string).collect();
            write!(f, ";BYMONTHDAY={}", days.join(","))?;
        }
        Ok(())
    }
}

/// The result of advancing a recurring task on finish.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Advance {
    /// The new `due`.
    pub due: Due,
    /// Calendar days between the old anchor date and the new due date; `deadline` shifts by
    /// the same amount.
    pub delta_days: i64,
    /// The rule to store in place of the old one, when the advance clamped a day the rule did
    /// not name (day 31 into a 30-day month, Feb 29 into a common year). Without it the
    /// clamped date would become the series' new day and every later occurrence would drift.
    pub rule: Option<Rule>,
}

/// Advance a recurring task.
///
/// * `from_completion == false` (Todoist "every"): the series is anchored at the current
///   `due` (or `today` when there is none) and the next occurrence is the first one strictly
///   after both the current due and `today` — finishing early still moves it forward.
/// * `from_completion == true` (Todoist "every!"): the series is re-anchored at `today` and the
///   next occurrence is the first one strictly after `today`.
///
/// The wall-clock time of a timed `due` is kept. When a "from due" advance clamps the anchor's
/// day, [`Advance::rule`] carries the rule with that day pinned; the caller must store it.
pub fn advance(
    rule: &Rule,
    from_completion: bool,
    due: Option<Due>,
    today: NaiveDate,
) -> Result<Advance> {
    let base = due.map_or(today, |d| d.date);
    let (anchor, after) = if from_completion {
        (today, today)
    } else {
        (base, base.max(today))
    };
    let next = rule.next_after(anchor, after).ok_or_else(|| {
        ShardsError::Validation(format!("recur '{rule}' has no occurrence after {after}"))
    })?;
    let template = due.unwrap_or(Due {
        date: base,
        time: None,
    });
    // "every!" re-anchors on the completion day each time, so it has no series day to keep.
    let rule = if from_completion || next.day() == anchor.day() {
        None
    } else {
        rule.pinned_to(anchor)
    };
    Ok(Advance {
        due: template.on(next),
        delta_days: (next - base).num_days(),
        rule,
    })
}

/// Shift a date by whole days, saturating at the calendar's ends.
pub fn shift_days(date: NaiveDate, days: i64) -> NaiveDate {
    Duration::try_days(days)
        .and_then(|d| date.checked_add_signed(d))
        .unwrap_or(date)
}

// ---------------------------------------------------------------------------------------
// calendar helpers
// ---------------------------------------------------------------------------------------

fn weekday(code: &str) -> Option<Weekday> {
    Some(match code {
        "MO" => Weekday::Mon,
        "TU" => Weekday::Tue,
        "WE" => Weekday::Wed,
        "TH" => Weekday::Thu,
        "FR" => Weekday::Fri,
        "SA" => Weekday::Sat,
        "SU" => Weekday::Sun,
        _ => return None,
    })
}

fn weekday_code(day: Weekday) -> &'static str {
    match day {
        Weekday::Mon => "MO",
        Weekday::Tue => "TU",
        Weekday::Wed => "WE",
        Weekday::Thu => "TH",
        Weekday::Fri => "FR",
        Weekday::Sat => "SA",
        Weekday::Sun => "SU",
    }
}

/// The Monday that starts `date`'s week (RFC 5545 default `WKST=MO`).
fn week_start(date: NaiveDate) -> NaiveDate {
    shift_days(date, -i64::from(date.weekday().num_days_from_monday()))
}

/// Months since year 0, so month arithmetic is plain integer arithmetic.
fn month_index(date: NaiveDate) -> i64 {
    i64::from(date.year()) * 12 + i64::from(date.month0())
}

fn month_from_index(index: i64) -> Option<(i32, u32)> {
    let year = i32::try_from(index.div_euclid(12)).ok()?;
    let month = u32::try_from(index.rem_euclid(12)).ok()? + 1;
    Some((year, month))
}

fn days_in_month(year: i32, month: u32) -> Option<u32> {
    let first = NaiveDate::from_ymd_opt(year, month, 1)?;
    let next = if month == 12 {
        NaiveDate::from_ymd_opt(year.checked_add(1)?, 1, 1)?
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)?
    };
    u32::try_from((next - first).num_days()).ok()
}

/// A `BYMONTHDAY` value resolved into a month of `last` days, clamped into range: day 31 in
/// a 30-day month is the 30th (Todoist's end-of-month rule), `-1` is always the last day.
fn resolve_month_day(n: i32, last: u32) -> u32 {
    let last_i = i64::from(last);
    let day = if n > 0 {
        i64::from(n).min(last_i)
    } else {
        (last_i + i64::from(n) + 1).max(1)
    };
    u32::try_from(day).unwrap_or(1)
}

#[cfg(test)]
#[allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::panic,
    clippy::indexing_slicing
)]
mod tests {
    use super::*;

    fn d(text: &str) -> NaiveDate {
        NaiveDate::parse_from_str(text, "%Y-%m-%d").unwrap()
    }

    fn rule(text: &str) -> Rule {
        Rule::parse(text).unwrap()
    }

    fn due(text: &str) -> Due {
        Due::parse(text).unwrap()
    }

    #[test]
    fn due_accepts_exactly_two_shapes() {
        assert_eq!(due("2026-10-20").to_string(), "2026-10-20");
        assert_eq!(due("2026-10-20T09:05").to_string(), "2026-10-20T09:05");
        assert_eq!(due(" 2026-10-20 ").to_string(), "2026-10-20");
        for bad in [
            "2026-1-20",
            "2026-10-2",
            "2026-13-01",
            "2026-02-30",
            "2026-10-20 09:00",
            "2026-10-20T9:00",
            "2026-10-20T09:00:00",
            "2026-10-20T25:00",
            "2026-10-20Z",
            "tomorrow",
            "",
        ] {
            let err = Due::parse(bad).unwrap_err();
            assert_eq!(err.code(), 2, "{bad}");
            assert!(err.to_string().starts_with("invalid due: "), "{err}");
        }
    }

    #[test]
    fn deadline_is_a_bare_date() {
        assert_eq!(parse_deadline("2026-12-31").unwrap(), d("2026-12-31"));
        assert!(parse_deadline("2026-12-31T10:00").is_err());
        assert_eq!(
            parse_deadline("31.12.2026").unwrap_err().to_string(),
            "invalid deadline: '31.12.2026' (use YYYY-MM-DD)"
        );
    }

    #[test]
    fn stored_due_reads_leniently_and_writes_canonically() {
        let value = Due::from_value(&Value::str("2026-10-20T09:00:00")).unwrap();
        assert_eq!(value.to_string(), "2026-10-20T09:00");
        let value = Due::from_value(&crate::fm::load::resolve_plain("2026-10-20")).unwrap();
        assert_eq!(value, due("2026-10-20"));
        assert_eq!(Due::from_value(&Value::Int(3)), None);
        assert_eq!(Due::from_value(&Value::str("soon")), None);
        match due("2026-10-20T09:30").to_value() {
            Value::Ts(ts) => assert_eq!(ts.raw, "2026-10-20T09:30"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn rules_parse_into_a_canonical_spelling() {
        assert_eq!(rule("FREQ=DAILY").to_string(), "FREQ=DAILY");
        assert_eq!(rule("freq=daily;interval=1").to_string(), "FREQ=DAILY");
        assert_eq!(
            rule("RRULE:FREQ=WEEKLY;BYDAY=WE,MO,WE").to_string(),
            "FREQ=WEEKLY;BYDAY=MO,WE"
        );
        assert_eq!(
            rule("INTERVAL=2;FREQ=MONTHLY;BYMONTHDAY=1,-1").to_string(),
            "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1,-1"
        );
        assert_eq!(rule("FREQ=YEARLY").interval, 1);
    }

    #[test]
    fn rules_outside_the_subset_are_validation_errors() {
        for bad in [
            "",
            "FREQ=HOURLY",
            "FREQ=DAILY;COUNT=3",
            "FREQ=DAILY;UNTIL=20261231",
            "FREQ=DAILY;BYDAY=MO",
            "FREQ=WEEKLY;BYMONTHDAY=1",
            "FREQ=MONTHLY;BYDAY=1MO",
            "FREQ=WEEKLY;BYDAY=XX",
            "FREQ=MONTHLY;BYMONTHDAY=0",
            "FREQ=MONTHLY;BYMONTHDAY=32",
            "FREQ=DAILY;INTERVAL=0",
            "FREQ=DAILY;INTERVAL=x",
            "FREQ=DAILY;FREQ=WEEKLY",
            "FREQ",
            "every day",
            "FREQ=MONTHLY;BYMONTH=2",
            "FREQ=WEEKLY;BYMONTH=2",
            "FREQ=YEARLY;BYMONTHDAY=29",
            "FREQ=YEARLY;BYMONTH=13",
            "FREQ=YEARLY;BYMONTH=0",
            "FREQ=DAILY;BYMONTHDAY=1",
        ] {
            let err = Rule::parse(bad).unwrap_err();
            assert_eq!(err.code(), 2, "{bad}");
            assert!(err.to_string().starts_with("invalid recur: "), "{err}");
        }
    }

    #[test]
    fn errors_quote_the_callers_spelling_not_an_uppercased_copy() {
        assert_eq!(
            Rule::parse("every day").unwrap_err().to_string(),
            "invalid recur: 'every day' (expected KEY=VALUE, got 'every day')"
        );
        assert_eq!(
            Rule::parse("freq=hourly").unwrap_err().to_string(),
            "invalid recur: 'freq=hourly' (unsupported FREQ 'hourly'; use DAILY, WEEKLY, MONTHLY, YEARLY)"
        );
        assert_eq!(
            Rule::parse("freq=weekly;byday=mo,xx").unwrap_err().to_string(),
            "invalid recur: 'freq=weekly;byday=mo,xx' (BYDAY takes MO, TU, WE, TH, FR, SA, SU; got 'xx')"
        );
        // The prefix is matched without slicing and in any case.
        assert_eq!(rule("rrule:freq=daily").to_string(), "FREQ=DAILY");
    }

    #[test]
    fn yearly_takes_bymonth_with_an_optional_bymonthday() {
        assert_eq!(
            rule("freq=yearly;bymonthday=29;bymonth=2").to_string(),
            "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29"
        );
        let r = rule("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29");
        // The anchor's own date does not matter once the rule names month and day.
        assert_eq!(
            r.next_after(d("2029-02-28"), d("2029-02-28")),
            Some(d("2030-02-28"))
        );
        assert_eq!(
            r.next_after(d("2031-02-28"), d("2031-02-28")),
            Some(d("2032-02-29"))
        );
        let two = rule("FREQ=YEARLY;BYMONTH=1,7");
        assert_eq!(
            two.next_after(d("2026-01-15"), d("2026-01-15")),
            Some(d("2026-07-15"))
        );
    }

    /// Feed each advance's due and pinned rule into the next one, as finishing the same task
    /// over and over does.
    fn chain(start: &str, recur: &str, steps: usize) -> (Vec<String>, String) {
        let mut r = rule(recur);
        let mut current = due(start);
        let mut seen = Vec::new();
        for _ in 0..steps {
            // `today` far in the past, so the series alone decides.
            let a = advance(&r, false, Some(current), d("2000-01-01")).unwrap();
            if let Some(pinned) = a.rule {
                r = pinned;
            }
            current = a.due;
            seen.push(current.to_string());
        }
        (seen, r.to_string())
    }

    #[test]
    fn chained_monthly_advances_keep_day_31_after_a_clamp() {
        let (seen, stored) = chain("2027-01-31", "FREQ=MONTHLY", 4);
        assert_eq!(
            seen,
            ["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]
        );
        assert_eq!(stored, "FREQ=MONTHLY;BYMONTHDAY=31");
        let (seen, _) = chain("2027-01-30T08:15", "FREQ=MONTHLY;INTERVAL=1", 3);
        assert_eq!(
            seen,
            ["2027-02-28T08:15", "2027-03-30T08:15", "2027-04-30T08:15"]
        );
        // No clamp, nothing pinned: the stored rule stays as the user wrote it.
        let (seen, stored) = chain("2027-01-15", "FREQ=MONTHLY", 3);
        assert_eq!(seen, ["2027-02-15", "2027-03-15", "2027-04-15"]);
        assert_eq!(stored, "FREQ=MONTHLY");
    }

    #[test]
    fn chained_yearly_advances_return_to_feb_29_in_leap_years() {
        let (seen, stored) = chain("2028-02-29", "FREQ=YEARLY", 4);
        assert_eq!(
            seen,
            ["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]
        );
        assert_eq!(stored, "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29");
        // BYMONTH alone leaves the day to the anchor, so it pins the same way.
        let (seen, stored) = chain("2028-02-29", "FREQ=YEARLY;BYMONTH=2", 4);
        assert_eq!(
            seen,
            ["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]
        );
        assert_eq!(stored, "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29");
        let (seen, stored) = chain("2027-01-31", "FREQ=YEARLY;BYMONTH=1,6", 3);
        assert_eq!(seen, ["2027-06-30", "2028-01-31", "2028-06-30"]);
        assert_eq!(stored, "FREQ=YEARLY;BYMONTH=1,6;BYMONTHDAY=31");
    }

    #[test]
    fn a_completion_anchored_advance_never_pins() {
        let r = rule("FREQ=MONTHLY");
        let a = advance(&r, true, Some(due("2027-01-31")), d("2027-01-31")).unwrap();
        assert_eq!(a.due.to_string(), "2027-02-28");
        assert_eq!(a.rule, None);
    }

    #[test]
    fn daily_with_an_interval() {
        let r = rule("FREQ=DAILY;INTERVAL=3");
        assert_eq!(
            r.next_after(d("2026-01-01"), d("2026-01-01")),
            Some(d("2026-01-04"))
        );
        // Skips whole periods when the anchor is far in the past, staying on the grid.
        assert_eq!(
            r.next_after(d("2026-01-01"), d("2026-01-10")),
            Some(d("2026-01-13"))
        );
        assert_eq!(
            r.next_after(d("2020-01-01"), d("2026-01-01")),
            Some(d("2026-01-02"))
        );
    }

    #[test]
    fn weekly_byday_picks_the_next_listed_weekday() {
        let r = rule("FREQ=WEEKLY;BYDAY=MO,WE");
        // 2026-10-12 is a Monday.
        assert_eq!(
            r.next_after(d("2026-10-12"), d("2026-10-12")),
            Some(d("2026-10-14"))
        );
        assert_eq!(
            r.next_after(d("2026-10-12"), d("2026-10-14")),
            Some(d("2026-10-19"))
        );
        // An anchor on an unlisted day still lands on a listed one.
        assert_eq!(
            r.next_after(d("2026-10-16"), d("2026-10-16")),
            Some(d("2026-10-19"))
        );
        // Without BYDAY the anchor's weekday repeats.
        let plain = rule("FREQ=WEEKLY");
        assert_eq!(
            plain.next_after(d("2026-10-15"), d("2026-10-15")),
            Some(d("2026-10-22"))
        );
    }

    #[test]
    fn weekly_interval_skips_whole_weeks() {
        let r = rule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR");
        // Mon 2026-10-12 anchors; Fri of the same week, then Mon two weeks on.
        assert_eq!(
            r.next_after(d("2026-10-12"), d("2026-10-12")),
            Some(d("2026-10-16"))
        );
        assert_eq!(
            r.next_after(d("2026-10-12"), d("2026-10-16")),
            Some(d("2026-10-26"))
        );
        // Far past anchor: stays on the even-week grid.
        assert_eq!(
            r.next_after(d("2026-10-12"), d("2026-11-03")),
            Some(d("2026-11-09"))
        );
    }

    #[test]
    fn monthly_clamps_to_the_end_of_short_months() {
        let r = rule("FREQ=MONTHLY;BYMONTHDAY=31");
        assert_eq!(
            r.next_after(d("2026-01-31"), d("2026-01-31")),
            Some(d("2026-02-28"))
        );
        assert_eq!(
            r.next_after(d("2026-01-31"), d("2026-02-28")),
            Some(d("2026-03-31"))
        );
        assert_eq!(
            r.next_after(d("2026-01-31"), d("2026-03-31")),
            Some(d("2026-04-30"))
        );
        assert_eq!(
            r.next_after(d("2028-01-31"), d("2028-01-31")),
            Some(d("2028-02-29"))
        );
        // Without BYMONTHDAY the anchor's day is the rule, clamped the same way.
        let plain = rule("FREQ=MONTHLY");
        assert_eq!(
            plain.next_after(d("2026-01-31"), d("2026-01-31")),
            Some(d("2026-02-28"))
        );
        // -1 is always the last day; two days clamping onto one date yield it once.
        let last = rule("FREQ=MONTHLY;BYMONTHDAY=30,-1");
        assert_eq!(
            last.next_after(d("2026-02-01"), d("2026-02-01")),
            Some(d("2026-02-28"))
        );
        assert_eq!(
            last.next_after(d("2026-02-01"), d("2026-02-28")),
            Some(d("2026-03-30"))
        );
        assert_eq!(
            last.next_after(d("2026-02-01"), d("2026-03-30")),
            Some(d("2026-03-31"))
        );
    }

    #[test]
    fn monthly_interval_and_year_rollover() {
        let r = rule("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1");
        assert_eq!(
            r.next_after(d("2026-11-01"), d("2026-11-01")),
            Some(d("2027-01-01"))
        );
        assert_eq!(
            r.next_after(d("2026-11-01"), d("2027-02-15")),
            Some(d("2027-03-01"))
        );
    }

    #[test]
    fn yearly_feb_29_clamps_in_common_years() {
        let r = rule("FREQ=YEARLY");
        assert_eq!(
            r.next_after(d("2024-02-29"), d("2024-02-29")),
            Some(d("2025-02-28"))
        );
        assert_eq!(
            r.next_after(d("2024-02-29"), d("2027-06-01")),
            Some(d("2028-02-29"))
        );
        let every4 = rule("FREQ=YEARLY;INTERVAL=4");
        assert_eq!(
            every4.next_after(d("2024-02-29"), d("2024-02-29")),
            Some(d("2028-02-29"))
        );
    }

    #[test]
    fn advance_from_due_moves_past_today_and_past_an_early_due() {
        let r = rule("FREQ=DAILY");
        // Overdue by days: the next occurrence after today.
        let a = advance(&r, false, Some(due("2026-10-01T09:00")), d("2026-10-15")).unwrap();
        assert_eq!(a.due.to_string(), "2026-10-16T09:00");
        assert_eq!(a.delta_days, 15);
        // Finished early: still advances past the current due.
        let a = advance(&r, false, Some(due("2026-10-20")), d("2026-10-15")).unwrap();
        assert_eq!(a.due.to_string(), "2026-10-21");
        assert_eq!(a.delta_days, 1);
        // No due: anchors on today.
        let a = advance(&r, false, None, d("2026-10-15")).unwrap();
        assert_eq!(a.due.to_string(), "2026-10-16");
    }

    #[test]
    fn advance_from_completion_reanchors_on_today() {
        let r = rule("FREQ=DAILY;INTERVAL=3");
        let a = advance(&r, true, Some(due("2026-10-01")), d("2026-10-15")).unwrap();
        assert_eq!(a.due.to_string(), "2026-10-18");
        assert_eq!(a.delta_days, 17);
        let weekly = rule("FREQ=WEEKLY;BYDAY=MO");
        // Thu 2026-10-15 → the next Monday.
        let a = advance(&weekly, true, Some(due("2026-10-12")), d("2026-10-15")).unwrap();
        assert_eq!(a.due.to_string(), "2026-10-19");
    }

    #[test]
    fn shifting_keeps_dates_in_range() {
        assert_eq!(shift_days(d("2026-01-31"), 1), d("2026-02-01"));
        assert_eq!(shift_days(d("2026-01-31"), -31), d("2025-12-31"));
        assert_eq!(shift_days(NaiveDate::MAX, 10), NaiveDate::MAX);
    }

    #[test]
    fn recur_from_takes_two_values() {
        assert!(validate_recur_from("due").is_ok());
        assert!(validate_recur_from("completion").is_ok());
        assert_eq!(
            validate_recur_from("done").unwrap_err().to_string(),
            "invalid recur_from: 'done' (use due, completion)"
        );
    }
}
