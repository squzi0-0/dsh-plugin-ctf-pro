---
name: ctf-blockchain
description: >
  CTF blockchain / smart-contract workflow — EVM (Solidity) and web3 challenges:
  reading contract state & storage, common vulns (reentrancy, access control,
  tx.origin, unchecked calls), and interacting via cast/web3. Use for on-chain
  or smart-contract challenges (seen in CSSCTF / KUBSTU blockchain categories).
---

# CTF Blockchain Workflow

> Use the test RPC and keys the challenge provides. Never touch mainnet or funds
> that aren't part of the challenge.

## 1. Understand the setup
Challenges usually give: an RPC URL, a chain/challenge id, a wallet + private key
(funded on a testnet), a target contract address, and a `Setup`/`Challenge`
Solidity source. Goal is typically to make `isSolved()` return true.

## 2. Tooling (via `ctf_run`)
**Foundry** is the fastest:
- `cast call <addr> "isSolved()(bool)" --rpc-url $RPC`
- `cast storage <addr> <slot> --rpc-url $RPC` — read private vars by slot.
- `cast send <addr> "fn(uint256)" <arg> --private-key $PK --rpc-url $RPC`
- `cast code <addr>` / `cast 4byte <selector>` to recover function signatures.
Alternatives: web3.py / ethers.js scripts, Remix for quick deploys.

## 3. Reading "private" data
`private` only hides from Solidity, not the chain. Read any variable with
`cast storage` at the right slot (mappings: `keccak256(key . slot)`; dynamic
arrays: `keccak256(slot)` + index). Decode packed slots by byte offset.

## 4. Common vulnerabilities
- **Access control**: missing `onlyOwner`, public `init`, unprotected selfdestruct.
- **tx.origin auth**: phish via a malicious contract that calls the target.
- **Reentrancy**: external call before state update → re-enter `withdraw` to drain.
- **Unchecked call / delegatecall**: control `delegatecall` target → hijack storage.
- **Integer issues** (pre-0.8 or `unchecked`): over/underflow.
- **Bad randomness**: `block.timestamp`/`blockhash`/`block.prevrandao` are
  predictable — compute the "random" value in your own contract in the same tx.
- **Signature replay / malleability**, **price/oracle manipulation**, **front-running**.

## 5. Exploit pattern
Write an attacker contract (Foundry script or Remix) that performs the calls in
one transaction when atomicity matters (e.g. flash-loan, reentrancy, same-block
randomness). Deploy, run, then verify:
`cast call <addr> "isSolved()(bool)"` → `true`.

## 6. Get the flag
Flags come from the challenge handler once solved (often a separate TCP service
you `nc` to with your challenge id), or emitted in an event / returned by a
`flag()` getter. Decode events with `cast` and run `ctf_extract_flags` on output.
