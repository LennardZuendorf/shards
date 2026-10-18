fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "shards_call",
            "shards_open",
            "host_pick_vault",
        ]),
    ))
    .unwrap_or_else(|e| panic!("tauri build: {e}"));
}
