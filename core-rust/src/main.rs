mod overlay;

use std::{
    fs::{self},
    io::Cursor,
    path::{Path, PathBuf},
    process::ExitCode,
};

use anyhow::{anyhow, bail, Context as _, Result};
use c2pa::{Builder, Context as C2paContext, Reader, SigningAlg};
use clap::Parser;
use serde_json::{json, Value};

const AI_SOURCE_TYPE: &str = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

/// Signs AI-generated images with a C2PA manifest (EU AI Act Art. 50 machine-readable marking).
#[derive(Parser)]
#[command(version, about)]
struct Cli {
    /// Unsigned input image (JPEG, PNG, WebP)
    #[arg(long, required_unless_present = "inspect", conflicts_with = "inspect")]
    input: Option<PathBuf>,
    /// Destination for the signed image
    #[arg(long, required_unless_present = "inspect")]
    output: Option<PathBuf>,
    /// Generative model / tool name, e.g. "FLUX.1-dev"
    #[arg(long, required_unless_present = "inspect")]
    model: Option<String>,
    /// Creator / author name
    #[arg(long, required_unless_present = "inspect")]
    author: Option<String>,
    /// Optional copyright statement
    #[arg(long)]
    copyright: Option<String>,
    /// Optional prompt; embedded in the manifest only if given
    #[arg(long)]
    prompt: Option<String>,
    /// Override the MIME type (default: derived from file extension)
    #[arg(long)]
    format: Option<String>,
    /// Signing certificate chain (PEM)
    #[arg(long, env = "C2PA_CERT", default_value = "certs/sample.certs")]
    cert: PathBuf,
    /// Private key (PKCS#8 PEM)
    #[arg(long, env = "C2PA_KEY", default_value = "certs/sample.key")]
    key: PathBuf,
    /// EU AI label icon to burn into the image before signing (omit for no visible label)
    #[arg(long, value_enum)]
    icon: Option<overlay::Icon>,
    #[arg(long, value_enum, default_value = "bottom-right")]
    icon_position: overlay::Position,
    #[arg(long, value_enum, default_value = "black")]
    icon_color: overlay::Color,
    /// Icon opacity in percent (1-100)
    #[arg(long, default_value_t = 100, value_parser = clap::value_parser!(u8).range(1..=100))]
    icon_opacity: u8,
    #[arg(long, value_enum, default_value = "medium")]
    icon_size: overlay::Size,
    /// Inspect an existing file and print its C2PA manifest as JSON
    #[arg(long, value_name = "FILE")]
    inspect: Option<PathBuf>,
}

fn mime_for(path: &Path, over: &Option<String>) -> Result<String> {
    if let Some(f) = over {
        return Ok(f.clone());
    }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    Ok(match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => bail!("unsupported file extension '{ext}' (use jpg, png or webp, or pass --format)"),
    }
    .to_string())
}

fn sign(cli: &Cli) -> Result<Value> {
    let (input, output) = (cli.input.as_ref().unwrap(), cli.output.as_ref().unwrap());
    let (model, author) = (cli.model.as_deref().unwrap(), cli.author.as_deref().unwrap());
    let format = mime_for(input, &cli.format)?;

    let signer = c2pa::create_signer::from_files(&cli.cert, &cli.key, SigningAlg::Es256, None)
        .with_context(|| format!("loading signing credentials {} / {}", cli.cert.display(), cli.key.display()))?;

    let mut builder = Builder::default().with_definition(json!({
        "title": input.file_name().and_then(|n| n.to_str()).unwrap_or("image"),
        "claim_generator_info": [{ "name": "cp2a-content-signer", "version": env!("CARGO_PKG_VERSION") }],
    }))?;

    builder.add_action(json!({
        "action": "c2pa.created",
        "digitalSourceType": AI_SOURCE_TYPE,
        "softwareAgent": { "name": model },
    }))?;

    let mut work = json!({ "@context": "https://schema.org", "@type": "CreativeWork",
        "author": [{ "@type": "Person", "name": author }] });
    if let Some(c) = &cli.copyright {
        work["copyrightNotice"] = json!(c);
    }
    builder.add_assertion("stds.schema-org.CreativeWork", &work)?;

    let mut ai = json!({ "ai_generated": true, "model": model, "regulation": "EU AI Act Art. 50" });
    if let Some(p) = &cli.prompt {
        ai["prompt"] = json!(p);
    }
    let mut source = fs::read(input).with_context(|| format!("reading {}", input.display()))?;
    if let Some(icon) = cli.icon {
        let o = overlay::Overlay {
            icon,
            position: cli.icon_position,
            color: cli.icon_color,
            opacity: cli.icon_opacity,
            size: cli.icon_size,
        };
        source = overlay::apply(&source, overlay::format_for_mime(&format)?, &o)?;
        ai["visible_label"] = json!({
            "icon": icon.name(),
            "position": format!("{:?}", cli.icon_position),
            "source": "https://digital-strategy.ec.europa.eu/en/policies/eu-icons-labelling-ai-generated-content",
        });
    }
    builder.add_assertion("org.cp2a.ai_generation", &ai)?;

    let mut src = Cursor::new(source);
    let mut dst = fs::OpenOptions::new().read(true).write(true).create(true).truncate(true)
        .open(output).with_context(|| format!("creating {}", output.display()))?;
    builder.sign(signer.as_ref(), &format, &mut src, &mut dst)?;
    drop(dst);

    let report = inspect_path(output)?;
    Ok(json!({ "ok": true, "output": output, "format": format, "manifest": report }))
}

fn inspect_path(path: &Path) -> Result<Value> {
    let format = mime_for(path, &None)?;
    let bytes = fs::read(path).with_context(|| format!("reading {}", path.display()))?;
    let reader = Reader::from_context(C2paContext::new()).with_stream(&format, Cursor::new(bytes))
        .map_err(|e| anyhow!("no readable C2PA manifest: {e}"))?;
    let mut v: Value = serde_json::from_str(&reader.json())?;
    v["validation_state"] = json!(format!("{:?}", reader.validation_state()));
    Ok(v)
}

fn run(cli: &Cli) -> Result<Value> {
    match &cli.inspect {
        Some(p) => Ok(json!({ "ok": true, "manifest": inspect_path(p)? })),
        None => sign(cli),
    }
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(&cli) {
        Ok(v) => {
            println!("{v}");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("{}", json!({ "ok": false, "error": format!("{e:#}") }));
            ExitCode::FAILURE
        }
    }
}
