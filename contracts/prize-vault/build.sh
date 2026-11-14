#!/bin/sh
# Builds the prize vault for the NEAR runtime.
#   --cfg near          : near-sdk uses NEAR host functions (panic messages, hashing); `cargo near` sets this too
#   -C target-cpu=mvp   : only WebAssembly MVP features, which the NEAR runtime accepts
set -e
cd "$(dirname "$0")"
RUSTFLAGS="-C target-cpu=mvp -C link-arg=-s --cfg near" CARGO_TARGET_DIR=target-wasm cargo build --target wasm32-unknown-unknown --release
ls -l target-wasm/wasm32-unknown-unknown/release/near_district_prize_vault.wasm
