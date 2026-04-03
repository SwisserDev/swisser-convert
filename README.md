# swisser-convert

Convert GLB 3D models to FiveM-ready resources from your terminal.

[![npm version](https://img.shields.io/npm/v/swisser-convert)](https://www.npmjs.com/package/swisser-convert)
[![npm downloads](https://img.shields.io/npm/dm/swisser-convert)](https://www.npmjs.com/package/swisser-convert)
[![license](https://img.shields.io/npm/l/swisser-convert)](./LICENSE)

```
 ┌  swisser-convert v1.0.0
 │
 ◇  File: my_car.glb (14.2 MB)
 │
 ◇  Upload complete
 │
 ◇  Conversion complete
 │
 ◇  Download complete
 │
 ▲  Saved to /home/user/my_car.zip
 │
 │  Size:       3.1 MB
 │  Artifacts:  GLB, YDR, YTD, YTYP, YBN, FXMANIFEST
 │
 └  Drop the extracted folder into your FiveM server resources/ directory
```

## Quick Start

```sh
npx swisser-convert my_model.glb
```

That's it. No Blender, no Sollumz, no setup. Your GLB goes in, a FiveM resource ZIP comes out.

## Install

If you use it regularly, install globally to skip the npx download:

```sh
npm install -g swisser-convert
```

Then just:

```sh
swisser-convert my_model.glb
```

## Usage

```sh
# Basic conversion
swisser-convert vehicle.glb

# Custom output directory
swisser-convert vehicle.glb --output ./resources

# Custom resource name
swisser-convert vehicle.glb --name my_custom_car
```

## Options

| Flag | Alias | Description | Default |
|------|-------|-------------|---------|
| `--output <dir>` | `-o` | Output directory for the ZIP | Current directory |
| `--name <name>` | `-n` | FiveM resource name | Filename without `.glb` |
| `--help` | `-h` | Show help | |
| `--version` | | Show version | |

## How It Works

1. Your `.glb` file is uploaded to the [Swisser AI](https://ai.swisser.dev) conversion API
2. The API runs it through Blender with the Sollumz addon to generate FiveM-native formats
3. You get back a ZIP containing a complete FiveM resource:
   - `stream/*.ydr` &mdash; Drawable model
   - `stream/*.ytd` &mdash; Texture dictionary
   - `stream/*.ytyp` &mdash; Archetype definition
   - `stream/*.ybn` &mdash; Collision mesh
   - `fxmanifest.lua` &mdash; Resource manifest

Extract the ZIP into your FiveM server's `resources/` folder and add `ensure <resource_name>` to your `server.cfg`.

## Limits

The public API allows **10 conversions per hour** per IP address. Files up to **50 MB** are supported.

Need more? Visit [ai.swisser.dev](https://ai.swisser.dev) for unlimited conversions.

## Requirements

- Node.js 18 or later

## License

[MIT](./LICENSE)
