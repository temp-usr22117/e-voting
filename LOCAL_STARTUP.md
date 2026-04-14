# Local Startup Guide

One-command startup:

npm run dev:up

This command will:
- Start Ganache (if not already running)
- Run Truffle migrate
- Start backend and frontend

Follow these commands from the project root.

1. Go to project folder
cd /home/babayaga/Documents/voting

2. Install dependencies (first time only, or after pulling changes)
npm install

3. Start Ganache in Terminal 1
./start-ganache.sh

4. Deploy contracts in Terminal 2 (normal daily use)
cd /home/babayaga/Documents/voting
npx truffle migrate --config truffle-config.cjs --network development

Use reset only when you need a fresh chain state:
npx truffle migrate --config truffle-config.cjs --reset --network development

When to use --reset:
- You changed Solidity contract code in contracts/
- You changed migration scripts in migrations/
- You want to clear old local candidates, voters, and votes
- Deployment state looks broken and needs a clean redeploy

5. Start backend in Terminal 3
cd /home/babayaga/Documents/voting/backend
npm start

6. Start frontend in Terminal 4
cd /home/babayaga/Documents/voting/frontend
npm start

7. Open app
http://localhost:5173

If contract migration fails:
- Confirm Ganache is running in Terminal 1
- Run from project root only
- Retry normal migrate:
cd /home/babayaga/Documents/voting
npx truffle migrate --config truffle-config.cjs --network development

- If still broken, force clean redeploy:
cd /home/babayaga/Documents/voting
npx truffle migrate --config truffle-config.cjs --reset --network development

MetaMask local settings:
- RPC URL: http://127.0.0.1:7545
- Chain ID: 1337
- Network Name: Ganache Local

Admin login wallet (Ganache default mnemonic):
- Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
