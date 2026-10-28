//! Burns an EU "AI" label icon into the pixels *before* signing, so the label is part of the signed asset
//! and stays visible when the image is reshared or downloaded.
use std::io::Cursor;

use anyhow::{bail, Result};
use clap::ValueEnum;
use image::{imageops, DynamicImage, ImageFormat, RgbaImage};

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum Icon {
    Basic,
    Generated,
    Modified,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum Position {
    TopLeft,
    TopCenter,
    TopRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum Color {
    Black,
    White,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
pub enum Size {
    Small,
    Medium,
    Large,
}

#[derive(Clone, Copy, Debug)]
pub struct Overlay {
    pub icon: Icon,
    pub position: Position,
    pub color: Color,
    /// 1..=100
    pub opacity: u8,
    pub size: Size,
}

// Official EU icons (black variant), trimmed and given a transparent background.
const BASIC: &[u8] = include_bytes!("../assets/basic.png");
const GENERATED: &[u8] = include_bytes!("../assets/generated.png");
const MODIFIED: &[u8] = include_bytes!("../assets/modified.png");

impl Icon {
    pub fn name(self) -> &'static str {
        match self {
            Icon::Basic => "basic",
            Icon::Generated => "fully-ai-generated",
            Icon::Modified => "partially-ai-modified",
        }
    }
    fn bytes(self) -> &'static [u8] {
        match self {
            Icon::Basic => BASIC,
            Icon::Generated => GENERATED,
            Icon::Modified => MODIFIED,
        }
    }
    /// Icon width as a fraction of image width at "medium".
    fn base_width(self) -> f32 {
        match self {
            Icon::Basic => 0.10,
            _ => 0.30,
        }
    }
}

impl Size {
    fn factor(self) -> f32 {
        match self {
            Size::Small => 0.7,
            Size::Medium => 1.0,
            Size::Large => 1.4,
        }
    }
}

fn load_icon(o: &Overlay) -> Result<RgbaImage> {
    let mut icon = image::load_from_memory_with_format(o.icon.bytes(), ImageFormat::Png)?.to_rgba8();
    for p in icon.pixels_mut() {
        if let Color::White = o.color {
            // black <-> white swap keeps the design's contrast (white shape, dark lettering)
            p.0[0] = 255 - p.0[0];
            p.0[1] = 255 - p.0[1];
            p.0[2] = 255 - p.0[2];
        }
        p.0[3] = (p.0[3] as f32 * o.opacity as f32 / 100.0).round() as u8;
    }
    Ok(icon)
}

/// Decodes `bytes`, composites the icon and re-encodes in the same format.
pub fn apply(bytes: &[u8], format: ImageFormat, o: &Overlay) -> Result<Vec<u8>> {
    let mut base = image::load_from_memory_with_format(bytes, format)?.to_rgba8();
    let (w, h) = base.dimensions();
    let icon = load_icon(o)?;

    let target_w = ((w as f32 * o.icon.base_width() * o.size.factor()).round() as u32).clamp(24, w);
    let target_h = ((icon.height() as f32 * target_w as f32 / icon.width() as f32).round() as u32).max(1);
    if target_h > h {
        bail!("image too small for the selected icon");
    }
    let icon = imageops::resize(&icon, target_w, target_h, imageops::FilterType::Lanczos3);

    let margin = (w as f32 * 0.025).round() as i64;
    let (iw, ih) = (target_w as i64, target_h as i64);
    let (w, h) = (w as i64, h as i64);
    let x = match o.position {
        Position::TopLeft | Position::BottomLeft => margin,
        Position::TopCenter | Position::BottomCenter => (w - iw) / 2,
        Position::TopRight | Position::BottomRight => w - iw - margin,
    }
    .max(0);
    let y = match o.position {
        Position::TopLeft | Position::TopCenter | Position::TopRight => margin,
        _ => h - ih - margin,
    }
    .max(0);

    imageops::overlay(&mut base, &icon, x, y);

    let mut out = Cursor::new(Vec::new());
    match format {
        ImageFormat::Jpeg => {
            // JPEG has no alpha channel
            let rgb = DynamicImage::ImageRgba8(base).to_rgb8();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 92).encode_image(&rgb)?;
        }
        f => DynamicImage::ImageRgba8(base).write_to(&mut out, f)?,
    }
    Ok(out.into_inner())
}

pub fn format_for_mime(mime: &str) -> Result<ImageFormat> {
    Ok(match mime {
        "image/jpeg" => ImageFormat::Jpeg,
        "image/png" => ImageFormat::Png,
        "image/webp" => ImageFormat::WebP,
        other => bail!("unsupported format {other}"),
    })
}
