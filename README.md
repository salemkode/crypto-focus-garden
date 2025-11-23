# Crypto Focus Garden

**Crypto Focus Garden** is a productivity game designed to gamify deep work in an era of constant distraction. The core concept is simple yet powerful: users earn a unique NFT tree for every successfully completed focus session.

By turning productivity into a game where users compete to grow the largest forest, we aim to help people reclaim their attention span and achieve "flow" states more frequently.

## Vision
More than just a tool, this is a **game**. In the age of Reels, TikTok, and high-speed content consumption, our ability to focus is diminishing. Crypto Focus Garden makes the act of slowing down and focusing rewarding and competitive.

## MVP Status & Technical Context
This project is currently in the **MVP (Minimum Viable Product)** stage, designed to demonstrate the "Proof of Focus" mechanic via blockchain.

### Current Architecture & Challenges
- **Platform:** Currently a web-based application.
- **Blockchain:** Bitcoin Cash (BCH) using CashTokens for NFT rewards.
- **Technical Constraint:** We initially aimed for a React Native mobile app, but the core library `libauth` (essential for our contract interactions) does not currently support React Native.
- **Solution:** We are migrating the project to **Ionic**, which will allow us to deploy to mobile devices while maintaining compatibility with our required libraries. This move will also enable better native session tracking capabilities compared to a standard web app.

### Verification & Mechanics
- **Focus Verification:** Verifying "true focus" is a challenge for any system, centralized or decentralized. Currently, the contract validates the *distribution* of the NFT based on the timer's completion.
- **Time Check:** For this MVP demonstration, strict time verification in the contract has been relaxed to allow for easier testing and showcasing of the minting flow.
- **Smart Contract:** A single smart contract manages the minting and locking of NFTs. When a user starts a session, they interact with this contract, and upon completion, the NFT is unlocked and sent to their wallet.

---

## Technical Setup (Original Starter Info)
BCH dApp starter repository featuring a testing suite set up to develop and test cashscript contracts and a Next.js web app to integrate them.