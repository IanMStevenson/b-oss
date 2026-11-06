// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

//! Node-API add-on that reads and changes the Microsoft Store startup task declared in an app's
//! MSIX manifest (Windows.ApplicationModel.StartupTask). It is loaded into the Electron main
//! process, which has the package identity the API needs. Every call runs on the libuv thread
//! pool and returns a Promise, so the main process never blocks.
//!
//! Each function resolves to the StartupTaskState name: Enabled, EnabledByPolicy, Disabled,
//! DisabledByUser or DisabledByPolicy. `enable` only asks Windows from a plain Disabled state and
//! `disable` only acts from Enabled; blocked states come back unchanged.

#[cfg(windows)]
mod imp {
    use napi::bindgen_prelude::*;
    use napi_derive::napi;
    use windows::core::HSTRING;
    use windows::ApplicationModel::{StartupTask, StartupTaskState};
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    #[derive(Clone, Copy)]
    enum Op {
        Get,
        Enable,
        Disable,
    }

    fn state_name(state: StartupTaskState) -> &'static str {
        match state {
            StartupTaskState::Enabled => "Enabled",
            StartupTaskState::EnabledByPolicy => "EnabledByPolicy",
            StartupTaskState::Disabled => "Disabled",
            StartupTaskState::DisabledByUser => "DisabledByUser",
            StartupTaskState::DisabledByPolicy => "DisabledByPolicy",
            _ => "Unknown",
        }
    }

    fn run(op: Op, task_id: &str) -> windows::core::Result<String> {
        // Thread-pool threads have no COM apartment yet. An error here (already initialised in a
        // different mode) is harmless, so ignore it.
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        let id = HSTRING::from(task_id);
        let task = StartupTask::GetAsync(&id)?.get()?;
        let state = task.State()?;
        match op {
            Op::Enable if state == StartupTaskState::Disabled => {
                task.RequestEnableAsync()?.get()?;
            }
            Op::Disable if state == StartupTaskState::Enabled => {
                task.Disable()?;
            }
            _ => {}
        }
        // Re-read: the first instance can be stale after a change.
        let task = StartupTask::GetAsync(&id)?.get()?;
        Ok(state_name(task.State()?).to_string())
    }

    pub struct StartupTaskWork {
        op: Op,
        task_id: String,
    }

    impl Task for StartupTaskWork {
        type Output = String;
        type JsValue = String;

        fn compute(&mut self) -> Result<Self::Output> {
            run(self.op, &self.task_id).map_err(|e| Error::from_reason(format!("{e}")))
        }

        fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
            Ok(output)
        }
    }

    /// Current state of the startup task `task_id`.
    #[napi(ts_return_type = "Promise<string>")]
    pub fn get_state(task_id: String) -> AsyncTask<StartupTaskWork> {
        AsyncTask::new(StartupTaskWork { op: Op::Get, task_id })
    }

    /// Ask Windows to enable the task (only from Disabled); resolves to the state afterwards.
    #[napi(ts_return_type = "Promise<string>")]
    pub fn enable(task_id: String) -> AsyncTask<StartupTaskWork> {
        AsyncTask::new(StartupTaskWork { op: Op::Enable, task_id })
    }

    /// Disable the task (only from Enabled); resolves to the state afterwards.
    #[napi(ts_return_type = "Promise<string>")]
    pub fn disable(task_id: String) -> AsyncTask<StartupTaskWork> {
        AsyncTask::new(StartupTaskWork { op: Op::Disable, task_id })
    }
}
