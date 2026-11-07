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
    use std::sync::OnceLock;
    use windows::ApplicationModel::Activation::ActivationKind;
    use windows::ApplicationModel::{AppInstance, StartupTask, StartupTaskState};
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

    /// Windows hands the activation arguments out once per process, so the first answer is kept.
    static LAUNCH_KIND: OnceLock<String> = OnceLock::new();

    fn kind_name(kind: ActivationKind) -> &'static str {
        match kind {
            ActivationKind::Launch => "Launch",
            ActivationKind::StartupTask => "StartupTask",
            ActivationKind::Protocol => "Protocol",
            ActivationKind::File => "File",
            _ => "Other",
        }
    }

    fn read_launch_kind() -> String {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        match AppInstance::GetActivatedEventArgs().and_then(|a| a.Kind()) {
            Ok(kind) => kind_name(kind).to_string(),
            // No activation arguments (not packaged, or already consumed): not a startup-task launch.
            Err(_) => "Unknown".to_string(),
        }
    }

    pub struct LaunchKindWork;

    impl Task for LaunchKindWork {
        type Output = String;
        type JsValue = String;

        fn compute(&mut self) -> Result<Self::Output> {
            Ok(LAUNCH_KIND.get_or_init(read_launch_kind).clone())
        }

        fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
            Ok(output)
        }
    }

    /// How this process was activated: StartupTask (Windows started it at sign-in), Launch (the user
    /// did), Protocol, File, Other, or Unknown (no activation arguments available). Windows only
    /// gives the arguments out once, so call this early; later calls return the first answer.
    #[napi(ts_return_type = "Promise<string>")]
    pub fn launch_kind() -> AsyncTask<LaunchKindWork> {
        AsyncTask::new(LaunchKindWork)
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
