use futures::FutureExt;
use std::{
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandChild;
use tokio::sync::oneshot;

static SIDECAR_PID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

#[derive(Clone, serde::Serialize)]
struct ServerReadyData {
    url: String,
}

#[derive(Clone)]
struct ServerState {
    child: Arc<Mutex<Option<CommandChild>>>,
    status: futures::future::Shared<oneshot::Receiver<Result<ServerReadyData, String>>>,
}

impl ServerState {
    pub fn new(
        child: Option<CommandChild>,
        status: oneshot::Receiver<Result<ServerReadyData, String>>,
    ) -> Self {
        Self {
            child: Arc::new(Mutex::new(child)),
            status: status.shared(),
        }
    }

    pub fn set_child(&self, child: Option<CommandChild>) {
        *self.child.lock().unwrap() = child;
    }
}

#[tauri::command]
fn kill_sidecar(app: AppHandle) {
    let pid = SIDECAR_PID.load(std::sync::atomic::Ordering::SeqCst);

    // 1) Graceful: POST /api/shutdown so the server can close sockets cleanly
    if pid != 0 {
        println!("[Cleanup] Requesting graceful shutdown (PID {pid})...");
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(3))
            .no_proxy()
            .build();
        if let Ok(client) = client {
            match client.post("http://127.0.0.1:13000/api/shutdown").send() {
                Ok(_) => {
                    println!("[Cleanup] Shutdown request sent, waiting...");
                    // Wait up to 3s for the process to exit
                    for _ in 0..30 {
                        std::thread::sleep(Duration::from_millis(100));
                        #[cfg(target_os = "windows")]
                        {
                            let out = std::process::Command::new("tasklist")
                                .args(["/FI", &format!("PID eq {pid}"), "/NH"])
                                .output();
                            if let Ok(out) = out {
                                let s = String::from_utf8_lossy(&out.stdout);
                                if !s.contains(&pid.to_string()) {
                                    println!("[Cleanup] Sidecar exited gracefully");
                                    SIDECAR_PID.store(0, std::sync::atomic::Ordering::SeqCst);
                                    return;
                                }
                            }
                        }
                        #[cfg(not(target_os = "windows"))]
                        {
                            let status = std::process::Command::new("kill")
                                .args(["-0", &pid.to_string()])
                                .status();
                            if let Ok(s) = status {
                                if !s.success() {
                                    println!("[Cleanup] Sidecar exited gracefully");
                                    SIDECAR_PID.store(0, std::sync::atomic::Ordering::SeqCst);
                                    return;
                                }
                            }
                        }
                    }
                    println!("[Cleanup] Graceful shutdown timed out, force killing...");
                }
                Err(e) => eprintln!("[Cleanup] Shutdown request failed: {e}, force killing..."),
            }
        }
    }

    // 2) Release child handle
    if let Some(server_state) = app.try_state::<ServerState>() {
        if let Some(child) = server_state.child.lock().unwrap().take() {
            println!("[Cleanup] Killing sidecar via child handle...");
            match child.kill() {
                Ok(_) => { println!("[Cleanup] Sidecar killed successfully"); return; }
                Err(e) => eprintln!("[Cleanup] Failed to kill via child handle: {}", e),
            }
        }
    }

    // 3) Force kill as last resort
    if pid != 0 {
        println!("[Cleanup] Force killing sidecar PID: {pid}");
        #[cfg(target_os = "windows")]
        { let _ = std::process::Command::new("taskkill").args(["/F", "/PID", &pid.to_string()]).output(); }
        #[cfg(not(target_os = "windows"))]
        { let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output(); }
        SIDECAR_PID.store(0, std::sync::atomic::Ordering::SeqCst);
    } else {
        println!("[Cleanup] No sidecar process to kill");
    }
}

#[tauri::command]
async fn ensure_server_ready(state: State<'_, ServerState>) -> Result<ServerReadyData, String> {
    state
        .status
        .clone()
        .await
        .map_err(|_| "Failed to get server status".to_string())?
}

fn get_sidecar_path(app: &AppHandle) -> std::path::PathBuf {
    let current_bin = tauri::process::current_binary(&app.env())
        .expect("Failed to get current binary");
    let bin_parent = current_bin.parent().expect("Failed to get parent dir");
    let bin_dir = bin_parent.to_path_buf();

    #[cfg(target_os = "macos")]
    {
        let res_dir = if bin_parent.ends_with("MacOS") {
            bin_parent.parent().unwrap().join("Resources")
        } else {
            bin_dir.clone()
        };

        let binaries_dir = res_dir.join("binaries");
        let universal = binaries_dir.join("clawbox-core-universal-apple-darwin");
        if universal.exists() { return universal; }

        #[cfg(target_arch = "aarch64")]
        let arch = binaries_dir.join("clawbox-core-aarch64-apple-darwin");
        #[cfg(target_arch = "x86_64")]
        let arch = binaries_dir.join("clawbox-core-x86_64-apple-darwin");

        if arch.exists() { return arch; }

        let universal_flat = res_dir.join("clawbox-core-universal-apple-darwin");
        if universal_flat.exists() { return universal_flat; }

        #[cfg(target_arch = "aarch64")]
        let arch_flat = res_dir.join("clawbox-core-aarch64-apple-darwin");
        #[cfg(target_arch = "x86_64")]
        let arch_flat = res_dir.join("clawbox-core-x86_64-apple-darwin");

        if arch_flat.exists() { return arch_flat; }
    }

    #[cfg(target_os = "windows")]
    {
        let candidates = vec![
            bin_dir.join("clawbox-core-x86_64-pc-windows-msvc.exe"),
            bin_dir.join("clawbox-core.exe"),
            bin_dir.join("binaries").join("clawbox-core-x86_64-pc-windows-msvc.exe"),
            bin_dir.join("binaries").join("clawbox-core.exe"),
        ];
        for path in &candidates {
            if path.exists() { return path.clone(); }
        }
    }

    #[cfg(target_os = "windows")]
    return bin_dir.join("clawbox-core.exe");
    #[cfg(not(target_os = "windows"))]
    bin_dir.join("clawbox-core")
}

fn ensure_clawbox_home() -> std::path::PathBuf {
    let path = if let Ok(h) = std::env::var("CLAWBOX_HOME") {
        std::path::PathBuf::from(h)
    } else {
        let home = if cfg!(windows) {
            std::env::var("USERPROFILE")
                .or_else(|_| {
                    let drive = std::env::var("HOMEDRIVE").unwrap_or_else(|_| "C:".into());
                    let hp = std::env::var("HOMEPATH").unwrap_or_else(|_| "\\".into());
                    Ok::<_, std::env::VarError>(format!("{}{}", drive, hp))
                })
                .unwrap_or_else(|_| ".".into())
        } else {
            std::env::var("HOME").unwrap_or_else(|_| ".".into())
        };
        std::path::PathBuf::from(home).join(".wrapperbox")
    };
    if let Err(e) = std::fs::create_dir_all(&path) {
        eprintln!("[ClawBox] Warning: could not create home {}: {}", path.display(), e);
    } else {
        println!("[ClawBox] Home: {}", path.display());
    }
    path
}

fn spawn_sidecar(app: &AppHandle, port: u32) -> Result<CommandChild, String> {
    let sidecar = get_sidecar_path(app);
    let clawbox_home = ensure_clawbox_home();

    let current_bin = tauri::process::current_binary(&app.env())
        .expect("Failed to get current binary");
    let bin_parent = current_bin.parent().expect("Failed to get parent dir");
    let resources_dir: std::path::PathBuf = if bin_parent.ends_with("MacOS") {
        bin_parent.parent().unwrap().join("Resources")
    } else {
        let root = sidecar.parent().unwrap().to_path_buf();
        if root.join("package.json").exists() {
            root
        } else if bin_parent.join("package.json").exists() {
            bin_parent.to_path_buf()
        } else {
            root
        }
    };

    println!("[Sidecar] Path: {}", sidecar.display());
    println!("[Sidecar] Resources: {}", resources_dir.display());

    let mut cmd = std::process::Command::new(&sidecar);
    cmd.args(["--port", &port.to_string()])
        .env("TAURI_ENV", "production")
        .env("CLAWBOX_HOME", clawbox_home.display().to_string())
        .env("PI_PACKAGE_DIR", resources_dir.display().to_string())
        .current_dir(&resources_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child_proc = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn clawbox-core: {}", e))?;

    let pid = child_proc.id();
    println!("[Sidecar] Spawned with PID {pid}");
    SIDECAR_PID.store(pid, std::sync::atomic::Ordering::SeqCst);

    if let Some(stdout) = child_proc.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(stdout).lines().flatten() {
                println!("[Backend] {line}");
            }
        });
    }
    if let Some(stderr) = child_proc.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(stderr).lines().flatten() {
                eprintln!("[Backend] {line}");
            }
        });
    }

    Err("spawned-direct".into())
}

async fn check_server_health(url: &str) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .no_proxy()
        .build();
    let Ok(client) = client else { return false };
    client.get(&format!("{}/api/health", url)).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}

async fn setup_server_connection(app: &AppHandle) -> Result<(Option<CommandChild>, ServerReadyData), String> {
    let port = 13000;
    let url = format!("http://127.0.0.1:{port}");

    if check_server_health(&url).await {
        println!("[Setup] Found existing server at {url}");
        return Ok((None, ServerReadyData { url }));
    }

    println!("[Setup] Spawning local server...");
    let child = match spawn_sidecar(app, port) {
        Ok(c) => Some(c),
        Err(e) if e == "spawned-direct" => {
            println!("[Setup] Process spawned via std::process::Command");
            None
        }
        Err(e) => return Err(e),
    };

    let start = Instant::now();
    loop {
        if start.elapsed() > Duration::from_secs(30) {
            return Err("Server health check timeout after 30s".into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
        if check_server_health(&url).await {
            println!("[Setup] Server ready after {:?}", start.elapsed());
            return Ok((child, ServerReadyData { url }));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!("=== ClawBox Starting ===");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all())
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            kill_sidecar,
            ensure_server_ready,
        ])
        .setup(move |app| {
            ensure_clawbox_home();
            let app_handle = app.handle().clone();
            let (tx, rx) = oneshot::channel();
            app_handle.manage(ServerState::new(None, rx));

            tauri::async_runtime::spawn(async move {
                let res = match setup_server_connection(&app_handle).await {
                    Ok((child, data)) => {
                        app_handle.state::<ServerState>().set_child(child);
                        Ok(data)
                    }
                    Err(e) => {
                        eprintln!("[Setup] Error: {e}");
                        Err(e)
                    }
                };
                let _ = tx.send(res);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                kill_sidecar(app.clone());
            }
        });
}
