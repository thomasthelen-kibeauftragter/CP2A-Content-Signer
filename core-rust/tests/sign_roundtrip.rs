use std::{fs, process::Command};

// 1x1 RGBA PNG
const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
    0x1F, 0x15, 0xC4, 0x89, 0, 0, 0, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0, 0x1F, 0, 5, 0, 1,
    0xFF, 0x89, 0x99, 0x3D, 0x1D, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

fn bin() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_signer-core"));
    c.current_dir(env!("CARGO_MANIFEST_DIR"));
    c
}

#[test]
fn sign_then_inspect_marks_ai_generated() {
    let dir = std::env::temp_dir().join(format!("signer-test-{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let (inp, out) = (dir.join("in.png"), dir.join("out.png"));
    fs::write(&inp, PNG).unwrap();

    let o = bin()
        .args(["--input", inp.to_str().unwrap(), "--output", out.to_str().unwrap(), "--model", "FLUX.1", "--author", "Tester"])
        .output()
        .unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));

    let o = bin().args(["--inspect", out.to_str().unwrap()]).output().unwrap();
    let s = String::from_utf8(o.stdout).unwrap();
    assert!(s.contains("trainedAlgorithmicMedia") && s.contains("FLUX.1") && s.contains("Tester"), "{s}");

    let o = bin().args(["--inspect", inp.to_str().unwrap()]).output().unwrap();
    assert!(!o.status.success(), "unsigned file must not inspect OK");
    let _ = fs::remove_dir_all(dir);
}
