//! Must match packages/core/src/merkle.ts byte for byte.
use near_sdk::env;

pub type Hash = [u8; 32];

pub fn leaf_hash(campaign_id: u64, period_id: u32, account_id: &str, amount: u128) -> Hash {
    let body = format!("{}\u{1f}{}\u{1f}{}\u{1f}{}", campaign_id, period_id, account_id, amount);
    let mut input = Vec::with_capacity(body.len() + 1);
    input.push(0u8);
    input.extend_from_slice(body.as_bytes());
    to_hash(env::sha256(&input))
}

pub fn node_hash(a: &Hash, b: &Hash) -> Hash {
    let (x, y) = if a <= b { (a, b) } else { (b, a) };
    let mut input = Vec::with_capacity(65);
    input.push(1u8);
    input.extend_from_slice(x);
    input.extend_from_slice(y);
    to_hash(env::sha256(&input))
}

pub fn verify(leaf: Hash, proof: &[Hash], root: &Hash) -> bool {
    let mut h = leaf;
    for p in proof {
        h = node_hash(&h, p);
    }
    &h == root
}

pub fn parse_hex32(s: &str) -> Hash {
    let bytes = hex::decode(s).unwrap_or_else(|_| env::panic_str("ERR_INVALID_HEX"));
    to_hash(bytes)
}

fn to_hash(v: Vec<u8>) -> Hash {
    v.try_into().unwrap_or_else(|_| env::panic_str("ERR_INVALID_HASH_LENGTH"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Same vector as packages/core/src/core.test.ts "matches the Rust contract test vector".
    #[test]
    fn matches_typescript_vector() {
        let a = leaf_hash(1, 1, "alice.near", 500);
        let b = leaf_hash(1, 1, "bob.near", 300);
        let root = node_hash(&a, &b);
        assert_eq!(hex::encode(root), "c2d77a0eeb8d427e44e04e59af6f46c25209e76978ddc3b8b25fa72b06f4c210");
        assert!(verify(a, &[b], &root));
        assert!(!verify(leaf_hash(1, 1, "alice.near", 501), &[b], &root));
    }
}
