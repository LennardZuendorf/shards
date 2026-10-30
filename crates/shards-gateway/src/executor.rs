//! Bounded work admission. Dropping a request cancels only work not yet admitted.
use crate::protocol::{ControlError, Execution, MAX_DURATION_MS};
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};

#[derive(Default)]
pub struct CallControl {
    phase: AtomicU8,
}
impl CallControl {
    pub fn start(&self) -> Result<(), ControlError> {
        self.phase
            .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| ())
            .map_err(|_| {
                ControlError::new(
                    "deadline_exceeded",
                    "request cancelled before execution",
                    504,
                    Execution::NotStarted,
                )
            })
    }
    fn execution(&self) -> Execution {
        match self.phase.load(Ordering::SeqCst) {
            1 => Execution::Unknown,
            2 => Execution::Completed,
            _ => Execution::NotStarted,
        }
    }
    fn expire(&self) -> ControlError {
        let _ = self
            .phase
            .compare_exchange(0, 3, Ordering::SeqCst, Ordering::SeqCst);
        deadline(self.execution())
    }
}

pub struct Executor {
    workers: Arc<tokio::sync::Semaphore>,
    queue: Arc<tokio::sync::Semaphore>,
}
impl Default for Executor {
    fn default() -> Self {
        Self {
            workers: Arc::new(tokio::sync::Semaphore::new(32)),
            queue: Arc::new(tokio::sync::Semaphore::new(32)),
        }
    }
}
impl Executor {
    pub async fn run<F, T>(&self, deadline_ms: i64, work: F) -> Result<T, ControlError>
    where
        F: FnOnce(Arc<CallControl>) -> Result<T, ControlError> + Send + 'static,
        T: Send + 'static,
    {
        let remaining = deadline_ms
            .saturating_sub(chrono::Utc::now().timestamp_millis())
            .min(MAX_DURATION_MS);
        if remaining <= 0 {
            return Err(deadline(Execution::NotStarted));
        }
        let end = tokio::time::Instant::now() + std::time::Duration::from_millis(remaining as u64);
        let control = Arc::new(CallControl::default());
        let _cancel = CancelOnDrop(control.clone());
        let worker = match self.workers.clone().try_acquire_owned() {
            Ok(permit) => permit,
            Err(_) => {
                let _queued = self.queue.clone().try_acquire_owned().map_err(|_| {
                    ControlError::new(
                        "busy",
                        "receiver work limit reached",
                        429,
                        Execution::NotStarted,
                    )
                })?;
                tokio::time::timeout_at(end, self.workers.clone().acquire_owned())
                    .await
                    .map_err(|_| deadline(Execution::NotStarted))?
                    .map_err(|_| {
                        ControlError::new(
                            "unavailable",
                            "receiver is stopping",
                            503,
                            Execution::NotStarted,
                        )
                    })?
            }
        };
        let inside = control.clone();
        let task = tokio::task::spawn_blocking(move || {
            let _worker = worker;
            if inside.phase.load(Ordering::SeqCst) == 3 {
                return Err(deadline(Execution::NotStarted));
            }
            let result = work(inside.clone());
            let _ = inside
                .phase
                .compare_exchange(1, 2, Ordering::SeqCst, Ordering::SeqCst);
            result
        });
        match tokio::time::timeout_at(end, task).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(ControlError::new(
                "outcome_unknown",
                "executor stopped without a result",
                504,
                control.execution(),
            )),
            Err(_) => Err(control.expire()),
        }
    }
}

struct CancelOnDrop(Arc<CallControl>);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        let _ = self
            .0
            .phase
            .compare_exchange(0, 3, Ordering::SeqCst, Ordering::SeqCst);
    }
}
fn deadline(execution: Execution) -> ControlError {
    let kind = if execution == Execution::NotStarted {
        "deadline_exceeded"
    } else {
        "outcome_unknown"
    };
    ControlError::new(
        kind,
        "request deadline elapsed; a started operation may have completed",
        504,
        execution,
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn invokes_one_admitted_operation_once() {
        let executor = Executor::default();
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        let result = executor
            .run(
                chrono::Utc::now().timestamp_millis() + 5000,
                move |control| {
                    control.start()?;
                    observed.fetch_add(1, Ordering::SeqCst);
                    Ok(json!({"committed":true}))
                },
            )
            .await
            .unwrap();
        assert_eq!(result, json!({"committed":true}));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn expired_work_does_not_invoke_the_operation() {
        let result = Executor::default()
            .run::<_, Value>(0, |_| panic!("expired operation ran"))
            .await
            .unwrap_err();
        assert_eq!(result.kind, "deadline_exceeded");
        assert_eq!(result.execution, Execution::NotStarted);
    }

    #[tokio::test]
    async fn disconnect_drops_queued_work_without_dispatch() {
        let executor = Arc::new(Executor::default());
        let held = executor
            .workers
            .clone()
            .acquire_many_owned(32)
            .await
            .unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        let runner = executor.clone();
        let task = tokio::spawn(async move {
            runner
                .run(
                    chrono::Utc::now().timestamp_millis() + 5000,
                    move |control| {
                        control.start()?;
                        observed.fetch_add(1, Ordering::SeqCst);
                        Ok(json!({}))
                    },
                )
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while executor.queue.available_permits() == 32 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        drop(held);
        assert_eq!(executor.queue.available_permits(), 32);
        assert_eq!(calls.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn expiration_atomically_prevents_later_admission() {
        let control = CallControl::default();
        assert_eq!(control.expire().execution, Execution::NotStarted);
        assert!(
            control.start().is_err(),
            "a not_started response must prevent later dispatch"
        );
        let admitted = CallControl::default();
        admitted.start().unwrap();
        assert_eq!(admitted.expire().execution, Execution::Unknown);
    }

    #[tokio::test]
    async fn timeout_after_admission_reports_unknown_without_replaying() {
        let executor = Arc::new(Executor::default());
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        let (started, ready) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let (finished, done) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            executor
                .run(
                    chrono::Utc::now().timestamp_millis() + 500,
                    move |control| {
                        control.start()?;
                        observed.fetch_add(1, Ordering::SeqCst);
                        started.send(()).unwrap();
                        wait.recv().unwrap();
                        finished.send(()).unwrap();
                        Ok(json!({"committed":true}))
                    },
                )
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(2), ready)
            .await
            .unwrap()
            .unwrap();
        let error = task.await.unwrap().unwrap_err();
        assert_eq!(error.kind, "outcome_unknown");
        assert_eq!(error.execution, Execution::Unknown);
        release.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), done)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn thirty_two_running_and_thirty_two_queued_refuse_the_next_call() {
        let executor = Arc::new(Executor::default());
        let gate = Arc::new((std::sync::Mutex::new(false), std::sync::Condvar::new()));
        let (entered, mut ready) = tokio::sync::mpsc::unbounded_channel();
        let mut tasks = Vec::new();
        for _ in 0..32 {
            let executor = executor.clone();
            let gate = gate.clone();
            let entered = entered.clone();
            tasks.push(tokio::spawn(async move {
                executor
                    .run(
                        chrono::Utc::now().timestamp_millis() + 5000,
                        move |control| {
                            control.start()?;
                            entered.send(()).unwrap();
                            let (lock, signal) = &*gate;
                            let held = lock.lock().unwrap();
                            drop(signal.wait_while(held, |open| !*open).unwrap());
                            Ok(json!({}))
                        },
                    )
                    .await
            }));
        }
        for _ in 0..32 {
            tokio::time::timeout(std::time::Duration::from_secs(2), ready.recv())
                .await
                .unwrap()
                .unwrap();
        }
        for _ in 0..32 {
            let executor = executor.clone();
            tasks.push(tokio::spawn(async move {
                executor
                    .run(chrono::Utc::now().timestamp_millis() + 5000, |control| {
                        control.start()?;
                        Ok(json!({}))
                    })
                    .await
            }));
        }
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while executor.queue.available_permits() != 0 {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let error = executor
            .run(chrono::Utc::now().timestamp_millis() + 5000, |_| {
                Ok(json!({}))
            })
            .await
            .unwrap_err();
        assert_eq!(error.kind, "busy");
        assert_eq!(error.execution, Execution::NotStarted);
        *gate.0.lock().unwrap() = true;
        gate.1.notify_all();
        for task in tasks {
            task.await.unwrap().unwrap();
        }
    }
}
