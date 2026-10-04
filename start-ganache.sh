#!/bin/bash
# Start Ganache with a fixed mnemonic so accounts remain the same
# This ensures the admin account doesn't change between restarts
# --database.dbPath saves blockchain state to disk for persistence across restarts
# --wallet.totalAccounts sets how many local test accounts Ganache should generate

npx ganache --port 7545 --chain.chainId 1337 --chain.networkId 1337 --database.dbPath ./ganache_db --wallet.totalAccounts 100 --mnemonic "test test test test test test test test test test test junk"
